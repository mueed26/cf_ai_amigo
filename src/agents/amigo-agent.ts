// One of these runs for every agent a user creates.
// It stores the agent's settings, chat, run history and memory, and runs it on schedule.
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, getAgentByName, type Connection } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import type { BrowserWorker } from "@cloudflare/puppeteer";
import { createWorkersAI } from "workers-ai-provider";
import { cleanAi } from "../lib/ai";
import { secrets } from "../lib/integrations/secrets";
import { log } from "../lib/log";
import { localCronToUtc, localDateTimeToUtc } from "../lib/schedule";
import {
  buildTools,
  type MemoryStore,
  type WorkspaceTools
} from "../lib/tools";
import {
  MODEL,
  type AgentConfig,
  type AgentRun,
  type AgentSummary,
  type AmigoAgentState,
  type Memory,
  type RunStatus,
  type ToolCallRecord,
  type RunTrigger
} from "../shared";

type RunRow = {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  output: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  tool_calls: string | null;
};

type MemoryRow = {
  id: number;
  content: string;
  source: Memory["source"];
  created_at: string;
};

export type RunContext = {
  config: AgentConfig;
  workspaceId: string;
  timezone: string;
  memories: Memory[];
  previousOutputs: string[];
};

const MAX_MEMORIES = 50;
// A run with no news for this long is treated as stuck.
const STUCK_RUN_MS = 30 * 60_000;

// App tools (Gmail, Slack...) run in the user's Workspace, which holds the logins.
export function workspaceTools(env: Env, workspaceId: string): WorkspaceTools {
  const stub = () => getAgentByName(env.Workspace, workspaceId);
  return {
    callTool: async (name, args) =>
      (await stub()).callTool(name, args) as Promise<unknown>,
    notionTools: async () =>
      (await stub()).notionTools() as Promise<
        { name: string; description: string; inputSchema: unknown }[]
      >
  };
}

// Instructions for the AI, used in both chat and scheduled runs.
export function agentSystemPrompt(ctx: {
  config: AgentConfig;
  timezone: string;
  memories: Memory[];
  mode: "chat" | "run";
}) {
  const { config, timezone, memories, mode } = ctx;
  const now = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short"
  });
  const memoryBlock = memories.length
    ? memories.map((m) => `- ${m.content}`).join("\n")
    : "(empty)";
  return `You are "${config.name}", an autonomous AI agent built with AMIGO on Cloudflare.

${config.instructions}

OBJECTIVE (one run): ${config.objective}

OUTPUT FORMAT: ${config.outputFormat}

CONTEXT
- Current time for the user: ${now} (${timezone}).
- ${mode === "run" ? "This is an automated run. Perform the objective once and return the final result. Do not ask questions; make reasonable assumptions." : "You are chatting with your owner. Answer their questions, help refine your work, and perform the objective if asked."}
- Scheduling is handled by the platform. Never try to schedule anything yourself.
- Only use the tools you have. Cite sources as Markdown links when you use the web.
- If the objective, instructions or user asks you to save, send or post the result (Google Doc, email, Slack, Notion), you MUST call that tool before giving your final answer. Then say where it was saved and include the link. Never claim you saved something without calling the tool.
- When a time window is mentioned (e.g. "this week"), pass it to the tools (e.g. period: "week").
- Use the remember tool for durable facts worth keeping between runs (preferences, items already reported). Avoid duplicates of what is already in memory.

LONG-TERM MEMORY
${memoryBlock}`;
}

export class AmigoAgent extends AIChatAgent<Env, AmigoAgentState> {
  maxPersistedMessages = 100;

  initialState: AmigoAgentState = {
    id: null,
    workspaceId: null,
    timezone: "UTC",
    status: "active",
    config: null,
    scheduleId: null,
    nextRunAt: null,
    activeRun: null,
    createdAt: null
  };

  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )`;
    // Older agents don't have the tool_calls column yet.
    try {
      this.sql`ALTER TABLE runs ADD COLUMN tool_calls TEXT`;
    } catch {
      // column already exists
    }
    this.sql`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;
  }

  // The browser can read this state but can't change it directly.
  validateStateChange(_next: AmigoAgentState, source: Connection | "server") {
    if (source !== "server") throw new Error("State is read-only for clients.");
  }

  // Called by the Workspace when the agent is created or deleted

  async initialize(input: {
    id: string;
    workspaceId: string;
    timezone: string;
    config: AgentConfig;
  }) {
    if (this.state.config) throw new Error("Agent already initialized.");
    this.setState({
      ...this.state,
      id: input.id,
      workspaceId: input.workspaceId,
      timezone: input.timezone,
      config: input.config,
      createdAt: new Date().toISOString()
    });
    await this.applySchedule();
    return this.summary();
  }

  async teardown() {
    await this.clearSchedule();
    await this.destroy();
  }

  // Actions the UI can call

  @callable()
  async runNow() {
    return this.startRun("manual");
  }

  @callable()
  async setStatus(status: AmigoAgentState["status"]) {
    this.setState({ ...this.state, status });
    await this.applySchedule();
    return this.summary();
  }

  @callable()
  async updateConfig(patch: Partial<AgentConfig>) {
    if (!this.state.config) throw new Error("Agent not initialized.");
    this.setState({
      ...this.state,
      config: { ...this.state.config, ...patch }
    });
    await this.applySchedule();
    return this.summary();
  }

  getConfig() {
    if (!this.state.config) throw new Error("Agent not initialized.");
    return this.state.config;
  }

  @callable()
  listRuns(limit = 25): AgentRun[] {
    return this
      .sql<RunRow>`SELECT * FROM runs ORDER BY started_at DESC LIMIT ${limit}`.map(
      toRun
    );
  }

  @callable()
  listMemories(): Memory[] {
    return this.sql<MemoryRow>`SELECT * FROM memories ORDER BY id DESC`.map(
      toMemory
    );
  }

  @callable()
  forgetMemory(id: number) {
    this.sql`DELETE FROM memories WHERE id = ${id}`;
    return this.listMemories();
  }

  // Chat

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const config = this.state.config;
    if (!config) throw new Error("Agent not initialized.");
    const workersai = createWorkersAI({ binding: cleanAi(this.env.AI) });

    const result = streamText({
      model: workersai(MODEL, { sessionAffinity: this.sessionAffinity }),
      system: agentSystemPrompt({
        config,
        timezone: this.state.timezone,
        memories: this.listMemories(),
        mode: "chat"
      }),
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: await buildTools({
        granted: config.tools,
        timezone: this.state.timezone,
        memory: this.memoryStore(),
        memorySource: "chat",
        workspace: this.state.workspaceId
          ? workspaceTools(this.env, this.state.workspaceId)
          : null,
        browser: this.env.BROWSER as unknown as BrowserWorker,
        // In chat, ask the user before sending emails or posting to Slack.
        requireApproval: true,
        trace: { agentId: this.name, mode: "chat" },
        searchApiKey: secrets(this.env).TAVILY_API_KEY
      }),
      stopWhen: stepCountIs(8),
      abortSignal: options?.abortSignal
    });
    return result.toUIMessageStreamResponse();
  }

  // Running the agent

  // Called automatically at the scheduled time.
  async scheduledRun() {
    if (this.state.config?.schedule.type === "once") {
      this.setState({ ...this.state, scheduleId: null, nextRunAt: null });
    }
    try {
      await this.startRun("schedule");
    } finally {
      this.refreshNextRun();
      await this.syncWorkspace();
    }
  }

  private async startRun(trigger: RunTrigger) {
    if (!this.state.config) throw new Error("Agent not initialized.");
    if (trigger === "schedule" && this.state.status !== "active") return null;

    // A run that never reported back would block the agent forever,
    // so a run older than the limit is marked failed and replaced.
    const active = this.state.activeRun;
    if (active) {
      const age = Date.now() - new Date(active.startedAt ?? 0).getTime();
      if (age < STUCK_RUN_MS) throw new Error("A run is already in progress.");
      await this.finishRun(active.runId, {
        error: "Run stopped responding and was cancelled."
      });
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    this.sql`INSERT INTO runs (id, trigger, status, started_at)
             VALUES (${runId}, ${trigger}, 'running', ${startedAt})`;
    this.setState({
      ...this.state,
      activeRun: { runId, step: "queued", startedAt }
    });
    log("run_start", { agentId: this.name, runId, trigger });

    try {
      await this.runWorkflow("AGENT_RUN_WORKFLOW", { runId }, { id: runId });
    } catch (e) {
      // The workflow never started, so don't leave the agent "running".
      const message = e instanceof Error ? e.message : String(e);
      await this.finishRun(runId, {
        error: `Couldn't start the run: ${message}`
      });
      throw e;
    }
    await this.syncWorkspace();
    return runId;
  }

  // Called by the run workflow to get what it needs.
  getRunContext(): RunContext {
    const config = this.state.config;
    if (!config) throw new Error("Agent not initialized.");
    const previousOutputs = this.sql<{ output: string }>`
      SELECT output FROM runs WHERE status = 'completed' AND output IS NOT NULL
      ORDER BY started_at DESC LIMIT 2`.map((r) => r.output.slice(0, 1500));
    if (!this.state.workspaceId) throw new Error("Agent has no workspace.");
    return {
      config,
      workspaceId: this.state.workspaceId,
      timezone: this.state.timezone,
      memories: this.listMemories(),
      previousOutputs
    };
  }

  // Called by the run workflow to save a memory.
  addMemory(content: string, source: Memory["source"]): Memory {
    return this.insertMemory(content, source);
  }

  // Called by the run workflow to save the result.
  async finishRun(
    runId: string,
    result: { output?: string; error?: string; toolCalls?: ToolCallRecord[] }
  ) {
    const toolCalls = result.toolCalls ?? [];
    const toolErrors = toolCalls
      .filter((c) => !c.ok)
      .map((c) => `${c.tool}: ${c.error ?? "failed"}`);
    const status: RunStatus = result.error
      ? "failed"
      : toolErrors.length
        ? "partial"
        : "completed";
    this
      .sql`UPDATE runs SET status = ${status}, output = ${result.output ?? null},
             error = ${result.error ?? (toolErrors.length ? `Some tools failed:\n${toolErrors.join("\n")}` : null)}, completed_at = ${new Date().toISOString()},
             tool_calls = ${JSON.stringify(toolCalls)}
             WHERE id = ${runId}`;
    log("run_finish", {
      agentId: this.name,
      runId,
      status,
      toolCalls: toolCalls.length,
      failedTools: toolErrors.length,
      error: result.error
    });
    if (this.state.activeRun?.runId === runId) {
      this.setState({ ...this.state, activeRun: null });
    }
    this.broadcast(JSON.stringify({ type: "run-finished", runId, status }));
    await this.syncWorkspace();
  }

  async onWorkflowProgress(_name: string, runId: string, progress: unknown) {
    const step = (progress as { step?: string })?.step ?? "running";
    const active = this.state.activeRun;
    if (active?.runId === runId) {
      this.setState({ ...this.state, activeRun: { ...active, step } });
    }
  }

  async onWorkflowError(_name: string, runId: string, error: string) {
    await this.finishRun(runId, { error });
  }

  // Scheduling

  private async clearSchedule() {
    if (this.state.scheduleId) await this.cancelSchedule(this.state.scheduleId);
    this.setState({ ...this.state, scheduleId: null, nextRunAt: null });
  }

  // Set up (or clear) the schedule from the agent's settings.
  private async applySchedule() {
    await this.clearSchedule();
    const { config, status, timezone } = this.state;
    if (!config || status !== "active") return this.syncWorkspace();

    const { schedule } = config;
    let created: { id: string } | null = null;
    if (schedule.type === "recurring" && schedule.cron) {
      created = await this.schedule(
        localCronToUtc(schedule.cron, timezone),
        "scheduledRun"
      );
    } else if (schedule.type === "once" && schedule.runAt) {
      const at = localDateTimeToUtc(schedule.runAt, timezone);
      if (at.getTime() > Date.now())
        created = await this.schedule(at, "scheduledRun");
    }
    if (created) this.setState({ ...this.state, scheduleId: created.id });
    this.refreshNextRun();
    await this.syncWorkspace();
  }

  private refreshNextRun() {
    const s = this.state.scheduleId
      ? this.getSchedule(this.state.scheduleId)
      : undefined;
    const nextRunAt = s
      ? new Date(s.time < 1e12 ? s.time * 1000 : s.time).toISOString()
      : null;
    if (nextRunAt !== this.state.nextRunAt)
      this.setState({ ...this.state, nextRunAt });
  }

  // Helpers

  private insertMemory(content: string, source: Memory["source"]): Memory {
    const createdAt = new Date().toISOString();
    const [row] = this.sql<MemoryRow>`
      INSERT INTO memories (content, source, created_at)
      VALUES (${content.trim()}, ${source}, ${createdAt}) RETURNING *`;
    // Keep only the newest memories.
    this.sql`DELETE FROM memories WHERE id NOT IN
             (SELECT id FROM memories ORDER BY id DESC LIMIT ${MAX_MEMORIES})`;
    return toMemory(row);
  }

  private memoryStore(): MemoryStore {
    return {
      remember: (content, source) => this.insertMemory(content, source),
      recall: () => this.listMemories()
    };
  }

  // Called by the Workspace to refresh this agent's dashboard card.
  getSummary(): AgentSummary {
    return this.summary();
  }

  private summary(): AgentSummary {
    const { config } = this.state;
    const [stats] = this.sql<{
      total: number;
    }>`SELECT COUNT(*) AS total FROM runs`;
    const [last] = this
      .sql<RunRow>`SELECT * FROM runs ORDER BY started_at DESC LIMIT 1`;
    return {
      id: this.state.id ?? this.name,
      name: config?.name ?? "Untitled agent",
      image: config?.image,
      objective: config?.objective ?? "",
      tools: config?.tools ?? [],
      activeStep: this.state.activeRun?.step ?? null,
      description: config?.description ?? "",
      skills: config?.skills ?? [],
      status: this.state.status,
      scheduleLabel: config?.schedule.label ?? "Manual",
      nextRunAt: this.state.nextRunAt,
      lastRunStatus: last?.status ?? null,
      lastRunAt: last?.started_at ?? null,
      totalRuns: stats?.total ?? 0,
      createdAt: this.state.createdAt ?? new Date().toISOString()
    };
  }

  // Update this agent's card on the dashboard.
  private async syncWorkspace() {
    if (!this.state.workspaceId) return;
    const workspace = await getAgentByName(
      this.env.Workspace,
      this.state.workspaceId
    );
    await workspace.upsertAgent(this.summary());
  }
}

function toRun(r: RunRow): AgentRun {
  return {
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    output: r.output,
    error: r.error,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    toolCalls: r.tool_calls
      ? (JSON.parse(r.tool_calls) as ToolCallRecord[])
      : []
  };
}

function toMemory(r: MemoryRow): Memory {
  return {
    id: r.id,
    content: r.content,
    source: r.source,
    createdAt: r.created_at
  };
}
