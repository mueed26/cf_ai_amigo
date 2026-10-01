/**
 * cf_ai_amigo — dashboard shell. One Workspace agent per browser holds the
 * registry of agents; each agent is its own Durable Object.
 */
import { Suspense, useState } from "react";
import { useAgent } from "agents/react";
import { Badge, Button, PoweredByCloudflare, Text } from "@cloudflare/kumo";
import { ListIcon, PlusIcon, RobotIcon, XIcon } from "@phosphor-icons/react";
import type { Workspace } from "./agents/workspace";
import type { WorkspaceState } from "./shared";
import { AgentView } from "./components/AgentView";
import { CreateAgent } from "./components/CreateAgent";
import { RunStatusBadge, ThemeToggle, relativeTime } from "./components/ui";

/**
 * Demo identity: a random workspace id kept in this browser. It doubles as an
 * unguessable capability for the workspace (see README, "Security notes").
 */
function getWorkspaceId() {
  const key = "amigo-workspace-id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const workspaceId = getWorkspaceId();

function Dashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  const workspace = useAgent<Workspace, WorkspaceState>({
    agent: "Workspace",
    name: workspaceId,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false)
  });
  const agents = workspace.state?.agents ?? [];
  const loaded = workspace.state !== undefined;
  // First visit with no agents lands straight on the create flow.
  const view = selected ?? (loaded && agents.length === 0 ? "new" : null);

  function select(id: string | null) {
    setSelected(id);
    setNavOpen(false);
  }

  return (
    <div className="flex h-screen bg-kumo-elevated text-kumo-default">
      {/* Sidebar */}
      <aside
        className={`${navOpen ? "flex" : "hidden"} md:flex fixed md:static inset-0 z-40 w-full md:w-72 shrink-0 flex-col border-r border-kumo-line bg-kumo-base`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-kumo-line">
          <button
            type="button"
            onClick={() => select(null)}
            className="flex items-center gap-2"
          >
            <span className="text-lg">⛅</span>
            <span className="font-semibold">AMIGO</span>
            <Badge variant="secondary">on Cloudflare</Badge>
          </button>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              aria-label="Close menu"
              className="md:hidden"
              icon={<XIcon size={16} />}
              onClick={() => setNavOpen(false)}
            />
          </div>
        </div>
        <div className="p-3">
          <Button
            variant="primary"
            className="w-full"
            icon={<PlusIcon size={16} />}
            onClick={() => select("new")}
          >
            New agent
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => select(a.id)}
              className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                view === a.id ? "bg-kumo-control" : "hover:bg-kumo-control/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{a.name}</span>
                {a.status === "paused" ? (
                  <Badge variant="secondary">paused</Badge>
                ) : (
                  <RunStatusBadge status={a.lastRunStatus} />
                )}
              </div>
              <div className="mt-0.5 text-xs text-kumo-subtle truncate">
                {a.scheduleLabel}
                {a.nextRunAt &&
                  a.status === "active" &&
                  ` · next ${relativeTime(a.nextRunAt)}`}
              </div>
            </button>
          ))}
          {loaded && agents.length === 0 && (
            <p className="px-3 py-2 text-xs text-kumo-subtle">No agents yet.</p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-kumo-line flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-kumo-subtle">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            />
            {connected ? "Connected" : "Connecting…"}
          </span>
          <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-kumo-line bg-kumo-base">
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Open menu"
            icon={<ListIcon size={18} />}
            onClick={() => setNavOpen(true)}
          />
          <span className="font-semibold">⛅ AMIGO</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {view === "new" ? (
            <CreateAgent
              workspace={workspace.stub}
              onCreated={(id) => select(id)}
              onCancel={agents.length > 0 ? () => select(null) : undefined}
            />
          ) : view ? (
            <AgentView
              key={view}
              id={view}
              onDelete={async () => {
                await workspace.stub.deleteAgent(view);
                select(null);
              }}
            />
          ) : (
            <Overview agents={agents} onSelect={select} loaded={loaded} />
          )}
        </div>
      </main>
    </div>
  );
}

function Overview({
  agents,
  onSelect,
  loaded
}: {
  agents: WorkspaceState["agents"];
  onSelect: (id: string) => void;
  loaded: boolean;
}) {
  if (!loaded) {
    return <div className="p-8 text-kumo-inactive">Loading workspace…</div>;
  }
  const totalRuns = agents.reduce((n, a) => n + a.totalRuns, 0);
  const active = agents.filter((a) => a.status === "active").length;
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Your agents</h2>
        <Text size="sm" variant="secondary">
          {agents.length} agents · {active} active · {totalRuns} runs total
        </Text>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className="text-left rounded-xl ring ring-kumo-line bg-kumo-base p-4 space-y-2 hover:ring-kumo-brand transition-shadow"
          >
            <div className="flex items-center gap-2">
              <RobotIcon size={18} className="text-kumo-brand" />
              <span className="font-medium truncate">{a.name}</span>
            </div>
            <Text size="sm" variant="secondary">
              {a.description}
            </Text>
            <div className="text-xs text-kumo-subtle">
              {a.scheduleLabel} · {a.totalRuns} runs
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-kumo-inactive">
          Loading…
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
