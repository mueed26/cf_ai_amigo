/**
 * Types shared between the Worker (agents, workflow) and the React client.
 */

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type ScheduleType = "manual" | "once" | "recurring";

export type AgentSchedule = {
  type: ScheduleType;
  /** Human-readable label, e.g. "Every weekday at 09:00". */
  label: string;
  /** 5-field cron in the user's local time (recurring only). */
  cron?: string;
  /** Local ISO datetime "YYYY-MM-DDTHH:mm" (once only). */
  runAt?: string;
};

export type AgentConfig = {
  name: string;
  description: string;
  instructions: string;
  objective: string;
  skills: string[];
  tools: ToolSlug[];
  schedule: AgentSchedule;
  outputFormat: string;
};

/** Built-in, Cloudflare-only tools an agent may be granted. */
export const TOOL_CATALOG = [
  {
    slug: "web_search",
    name: "Web Search",
    description: "Search the public web for current information."
  },
  {
    slug: "web_fetch",
    name: "Web Fetch",
    description: "Read the text content of a public web page or JSON API."
  },
  {
    slug: "current_time",
    name: "Current Time",
    description: "Get the current date and time in the user's timezone."
  }
] as const;

export type ToolSlug = (typeof TOOL_CATALOG)[number]["slug"];

export type ClarificationQuestion = {
  id: string;
  question: string;
  type: "single_select" | "multi_select" | "text";
  options: string[];
  allowCustom: boolean;
};

export type PlanResult =
  | { status: "needs_clarification"; questions: ClarificationQuestion[] }
  | { status: "ready"; config: AgentConfig };

export type RunStatus = "running" | "completed" | "failed";
export type RunTrigger = "manual" | "schedule";

export type AgentRun = {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  output: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type Memory = {
  id: number;
  content: string;
  source: "run" | "chat";
  createdAt: string;
};

export type AgentStatus = "active" | "paused";

/** Lightweight row kept in the Workspace registry for the dashboard. */
export type AgentSummary = {
  id: string;
  name: string;
  description: string;
  skills: string[];
  status: AgentStatus;
  scheduleLabel: string;
  nextRunAt: string | null;
  lastRunStatus: RunStatus | null;
  lastRunAt: string | null;
  totalRuns: number;
  createdAt: string;
};

export type WorkspaceState = {
  agents: AgentSummary[];
};

export type AmigoAgentState = {
  id: string | null;
  workspaceId: string | null;
  timezone: string;
  status: AgentStatus;
  config: AgentConfig | null;
  scheduleId: string | null;
  nextRunAt: string | null;
  /** Live progress of the run currently executing in a Workflow. */
  activeRun: { runId: string; step: string } | null;
  createdAt: string | null;
};
