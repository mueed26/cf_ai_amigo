// Types used by both the server and the front end.

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Most agents one user can have.
export const MAX_AGENTS = 20;

export type ScheduleType = "manual" | "once" | "recurring";

export type AgentSchedule = {
  type: ScheduleType;
  // Shown to the user, e.g. "Every weekday at 09:00".
  label: string;
  // Cron in the user's time zone (repeating schedules).
  cron?: string;
  // Local date-time like "2026-10-02T09:30" (one-time runs).
  runAt?: string;
};

export type AgentConfig = {
  name: string;
  // Avatar image URL (DiceBear robot).
  image?: string;
  description: string;
  instructions: string;
  objective: string;
  skills: string[];
  tools: ToolSlug[];
  schedule: AgentSchedule;
  outputFormat: string;
};

// Apps the user can connect.
export type ConnectionId = "google" | "slack" | "notion";

// All tools an agent can use. connection: null means no login needed.
export const TOOL_CATALOG = [
  {
    slug: "web_search",
    name: "Web Search",
    description:
      "Search the public web for current information and read web pages.",
    connection: null
  },
  {
    slug: "current_time",
    name: "Current Time",
    description: "Get the current date and time in the user's timezone.",
    connection: null
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Search and read the user's emails, and send emails.",
    connection: "google"
  },
  {
    slug: "google_docs",
    name: "Google Docs",
    description:
      "Create, read and append to Google Docs (save reports and research).",
    connection: "google"
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Search, read, create and update Notion pages and databases.",
    connection: "notion"
  },
  {
    slug: "hacker_news",
    name: "Hacker News",
    description:
      "Search Hacker News and read front-page stories and comment threads (read-only).",
    connection: null
  },
  {
    slug: "slack",
    name: "Slack",
    description:
      "List channels, read channel messages and post messages to Slack.",
    connection: "slack"
  }
] as const satisfies readonly {
  slug: string;
  name: string;
  description: string;
  connection: ConnectionId | null;
}[];

export type ToolSlug = (typeof TOOL_CATALOG)[number]["slug"];

export type ConnectionStatus = {
  id: ConnectionId;
  name: string;
  connected: boolean;
  // e.g. the Gmail address or Slack workspace name.
  account: string | null;
  // How to connect: popup login, pasted token, or server settings.
  method: "oauth" | "token" | "config";
  detail: string | null;
};

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

export type RunStatus = "running" | "completed" | "partial" | "failed";
export type RunTrigger = "manual" | "schedule";

// One tool call made during a run (shown in the run's "Steps").
export type ToolCallRecord = {
  tool: string;
  ok: boolean;
  ms: number;
  error?: string;
};

export type AgentRun = {
  id: string;
  toolCalls: ToolCallRecord[];
  trigger: RunTrigger;
  status: RunStatus;
  output: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

// A run plus the agent it belongs to (for the dashboard and Runs page).
export type RunWithAgent = AgentRun & {
  agentId: string;
  agentName: string;
  agentImage: string | null;
  task: string;
};

export type Memory = {
  id: number;
  content: string;
  source: "run" | "chat";
  createdAt: string;
};

export type AgentStatus = "active" | "paused";

// Agent info shown on the dashboard.
export type AgentSummary = {
  id: string;
  name: string;
  image?: string;
  objective: string;
  tools: ToolSlug[];
  activeStep: string | null;
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
  // Only connection status; tokens are never sent to the browser.
  connections: ConnectionStatus[];
};

export type AmigoAgentState = {
  id: string | null;
  workspaceId: string | null;
  timezone: string;
  status: AgentStatus;
  config: AgentConfig | null;
  scheduleId: string | null;
  nextRunAt: string | null;
  // The run in progress, if any.
  activeRun: { runId: string; step: string; startedAt?: string } | null;
  createdAt: string | null;
};
