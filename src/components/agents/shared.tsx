// Bits shared by the agent screens: badges, tool chips and agent actions.
import { useState } from "react";
import { Link } from "react-router";
import {
  BookOpen,
  Clock,
  Globe,
  Mail,
  MessageSquare,
  Newspaper,
  Plug,
  TriangleAlert
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/lib/workspace-context";
import { toastError, toastSuccess } from "@/lib/format";
import {
  TOOL_CATALOG,
  type AgentSummary,
  type ConnectionStatus,
  type RunStatus,
  type ToolSlug
} from "@/shared";

const TOOL_ICONS: Record<ToolSlug, typeof Globe> = {
  web_search: Globe,
  current_time: Clock,
  hacker_news: Newspaper,
  gmail: Mail,
  google_docs: BookOpen,
  notion: BookOpen,
  slack: MessageSquare
};

export function RunStatusBadge({
  status
}: {
  status: RunStatus | "scheduled" | null;
}) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    partial: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-sky-100 text-sky-700",
    scheduled: "bg-slate-100 text-slate-700"
  };
  const label =
    status === "partial" ? "completed with errors" : (status ?? "no runs yet");
  return <Badge className={styles[status ?? "scheduled"]}>{label}</Badge>;
}

export function AgentStatusBadge({
  status
}: {
  status: AgentSummary["status"];
}) {
  return (
    <span
      className={`rounded-2xl px-2 py-0.5 text-xs font-normal ${
        status === "paused"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-green-100 text-green-700"
      }`}
    >
      {status.toUpperCase()}
    </span>
  );
}

export function ToolChips({ tools }: { tools: ToolSlug[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((slug) => {
        const tool = TOOL_CATALOG.find((t) => t.slug === slug);
        const Icon = TOOL_ICONS[slug] ?? Plug;
        return (
          <span
            key={slug}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
          >
            <Icon className="size-3" />
            {tool?.name ?? slug}
          </span>
        );
      })}
    </div>
  );
}

// Apps an agent needs that aren't connected yet.
export function missingConnections(
  tools: readonly string[],
  connections: ConnectionStatus[]
) {
  const needed = new Set(
    TOOL_CATALOG.filter((t) => tools.includes(t.slug) && t.connection).map(
      (t) => t.connection
    )
  );
  return connections.filter((c) => needed.has(c.id) && !c.connected);
}

// Yellow box asking the user to connect the apps an agent needs.
export function ConnectPrompt({ tools }: { tools: readonly string[] }) {
  const { state } = useWorkspace();
  const missing = missingConnections(tools, state?.connections ?? []);
  if (missing.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0" />
        Connect {missing.map((m) => m.name).join(", ")} so this agent can use
        it.
      </span>
      <Link
        to="/dashboard/integrations"
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-amber-900 px-3 text-xs font-semibold text-white hover:bg-amber-800"
      >
        Connect apps
      </Link>
    </div>
  );
}

// Run, pause/resume and delete, with toasts instead of browser alerts.
export function useAgentActions() {
  const { workspace } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(
    key: string,
    fn: () => Promise<unknown>,
    success?: string
  ) {
    setBusy(key);
    try {
      await fn();
      if (success) toastSuccess(success);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    run: (agent: AgentSummary) =>
      act(
        `run:${agent.id}`,
        () => workspace.stub.runAgent(agent.id),
        `${agent.name} is running…`
      ),
    toggle: (agent: AgentSummary) =>
      act(
        `toggle:${agent.id}`,
        () =>
          workspace.stub.setAgentStatus(
            agent.id,
            agent.status === "active" ? "paused" : "active"
          ),
        agent.status === "active"
          ? `${agent.name} paused`
          : `${agent.name} is active again`
      ),
    remove: (agent: AgentSummary) =>
      act(
        `delete:${agent.id}`,
        () => workspace.stub.deleteAgent(agent.id),
        `${agent.name} deleted`
      )
  };
}
