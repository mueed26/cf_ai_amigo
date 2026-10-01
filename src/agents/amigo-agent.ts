/**
 * AmigoAgent — one Durable Object per user-created agent.
 *
 *  - State (synced live to the UI): config, status, schedule, active run.
 *  - SQLite: run history + long-term memory.
 *  - Chat: talk to the agent directly (AIChatAgent + Llama 3.3 + tools).
 *  - Scheduling: `this.schedule()` (DO alarms) triggers runs.
 *  - Execution: every run is a durable Workflow (see workflows/agent-run.ts).
 */
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, getAgentByName, type Connection } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { localCronToUtc, localDateTimeToUtc } from "../lib/schedule";
import { buildTools, type MemoryStore } from "../lib/tools";
import {
  MODEL,
  type AgentConfig,
  type AgentRun,
  type AgentSummary,
  type AmigoAgentState,
  type Memory,
  type RunStatus,
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
};

type MemoryRow = {
  id: number;
  content: string;
  source: Memory["source"];
  created_at: string;
};

export type RunContext = {
  config: AgentConfig;
  timezone: string;
  memories: Memory[];
  previousOutputs: string[];
};

const MAX_MEMORIES = 50;

/** System prompt shared by chat and scheduled runs. */
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
    this.sql`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;
  }

  /** State is server-authoritative: clients read it, only callables change it. */
  validateStateChange(_next: AmigoAgentState, source: Connection | "server") {
    if (source !== "server") throw new Error("State is read-only for clients.");
  }

  // ── Lifecycle (called by the Workspace) ─────────────────────────────

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

  // ── Callables (used by the UI over the WebSocket) ───────────────────

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

  // ── Chat ────────────────────────────────────────────────────────────

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const config = this.state.config;
    if (!config) throw new Error("Agent not initialized.");
    const workersai = createWorkersAI({ binding: this.env.AI });

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
      tools: buildTools({
        granted: config.tools,
        timezone: this.state.timezone,
        memory: this.memoryStore(),
        memorySource: "chat"
      }),
      stopWhen: stepCountIs(8),
      abortSignal: options?.abortSignal
    });
    return result.toUIMessageStreamResponse();
  }

  // ── Runs (Workflow orchestration) ───────────────────────────────────

  /** Alarm callback registered via this.schedule(). */
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
    if (this.state.activeRun) throw new Error("A run is already in progress.");
    if (trigger === "schedule" && this.state.status !== "active") return null;

    const runId = crypto.randomUUID();
    this.sql`INSERT INTO runs (id, trigger, status, started_at)
             VALUES (${runId}, ${trigger}, 'running', ${new Date().toISOString()})`;
    this.setState({ ...this.state, activeRun: { runId, step: "queued" } });

    await this.runWorkflow("AGENT_RUN_WORKFLOW", { runId }, { id: runId });
    await this.syncWorkspace();
    return runId;
  }

  /** RPC from the workflow: everything a run needs, read once. */
  getRunContext(): RunContext {
    const config = this.state.config;
    if (!config) throw new Error("Agent not initialized.");
    const previousOutputs = this.sql<{ output: string }>`
      SELECT output FROM runs WHERE status = 'completed' AND output IS NOT NULL
      ORDER BY started_at DESC LIMIT 2`.map((r) => r.output.slice(0, 1500));
    return {
      config,
      timezone: this.state.timezone,
      memories: this.listMemories(),
      previousOutputs
    };
  }

  /** RPC from the workflow. */
  addMemory(content: string, source: Memory["source"]): Memory {
    return this.insertMemory(content, source);
  }

  /** RPC from the workflow: persist the final outcome of a run. */
  async finishRun(runId: string, result: { output?: string; error?: string }) {
    const status: RunStatus = result.error ? "failed" : "completed";
    this
      .sql`UPDATE runs SET status = ${status}, output = ${result.output ?? null},
             error = ${result.error ?? null}, completed_at = ${new Date().toISOString()}
             WHERE id = ${runId}`;
    if (this.state.activeRun?.runId === runId) {
      this.setState({ ...this.state, activeRun: null });
    }
    this.broadcast(JSON.stringify({ type: "run-finished", runId, status }));
    await this.syncWorkspace();
  }

  async onWorkflowProgress(_name: string, runId: string, progress: unknown) {
    const step = (progress as { step?: string })?.step ?? "running";
    if (this.state.activeRun?.runId === runId) {
      this.setState({ ...this.state, activeRun: { runId, step } });
    }
  }

  async onWorkflowError(_name: string, runId: string, error: string) {
    await this.finishRun(runId, { error });
  }

  // ── Scheduling ──────────────────────────────────────────────────────

  private async clearSchedule() {
    if (this.state.scheduleId) await this.cancelSchedule(this.state.scheduleId);
    this.setState({ ...this.state, scheduleId: null, nextRunAt: null });
  }

  /** (Re)create the DO alarm schedule from config + status. */
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

  // ── Helpers ─────────────────────────────────────────────────────────

  private insertMemory(content: string, source: Memory["source"]): Memory {
    const createdAt = new Date().toISOString();
    const [row] = this.sql<MemoryRow>`
      INSERT INTO memories (content, source, created_at)
      VALUES (${content.trim()}, ${source}, ${createdAt}) RETURNING *`;
    // Keep memory bounded: drop the oldest beyond the cap.
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

  /** Push this agent's summary to its Workspace registry (dashboard). */
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
    completedAt: r.completed_at
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
