/**
 * Workspace — one Durable Object per user workspace.
 *
 *  - Plans new agents from a plain-English prompt (Llama 3.3, JSON mode).
 *  - Creates/deletes AmigoAgent instances.
 *  - Keeps the agent registry in state, synced live to the dashboard.
 */
import { Agent, callable, getAgentByName, type Connection } from "agents";
import { planAgent } from "../lib/planner";
import type {
  AgentConfig,
  AgentSummary,
  PlanResult,
  WorkspaceState
} from "../shared";

const MAX_AGENTS = 20;

export class Workspace extends Agent<Env, WorkspaceState> {
  initialState: WorkspaceState = { agents: [] };

  validateStateChange(_next: WorkspaceState, source: Connection | "server") {
    if (source !== "server") throw new Error("State is read-only for clients.");
  }

  @callable()
  async plan(input: {
    prompt: string;
    answers?: Record<string, string | string[]>;
    timezone: string;
  }): Promise<PlanResult> {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new Error("Describe what the agent should do.");
    if (prompt.length > 4000) throw new Error("Prompt is too long.");
    return planAgent(this.env.AI, {
      ...input,
      prompt,
      timezone: safeTz(input.timezone)
    });
  }

  @callable()
  async createAgent(input: { config: AgentConfig; timezone: string }) {
    if (this.state.agents.length >= MAX_AGENTS) {
      throw new Error(`A workspace can hold at most ${MAX_AGENTS} agents.`);
    }
    const id = crypto.randomUUID();
    const agent = await getAgentByName(this.env.AmigoAgent, id);
    const summary = await agent.initialize({
      id,
      workspaceId: this.name,
      timezone: safeTz(input.timezone),
      config: input.config
    });
    this.setState({ agents: [summary, ...this.state.agents] });
    return id;
  }

  @callable()
  async deleteAgent(id: string) {
    if (!this.state.agents.some((a) => a.id === id))
      throw new Error("Unknown agent.");
    const agent = await getAgentByName(this.env.AmigoAgent, id);
    await agent.teardown();
    this.setState({ agents: this.state.agents.filter((a) => a.id !== id) });
  }

  /**
   * RPC from AmigoAgent whenever its status, schedule or runs change.
   * Only updates known agents, so a late sync from a deleted agent is ignored.
   */
  upsertAgent(summary: AgentSummary) {
    if (!this.state.agents.some((a) => a.id === summary.id)) return;
    this.setState({
      agents: this.state.agents.map((a) => (a.id === summary.id ? summary : a))
    });
  }
}

function safeTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
