// One live connection to the user's Workspace, shared by every dashboard page.
// It gives pages the agent list, app connections and the Workspace actions.
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useAgent } from "agents/react";
import type { Workspace } from "@/agents/workspace";
import type { WorkspaceState } from "@/shared";
import { useAuthQuery } from "@/lib/use-auth-query";

type WorkspaceAgent = ReturnType<typeof useAgent<Workspace, WorkspaceState>>;

type WorkspaceContextValue = {
  workspace: WorkspaceAgent;
  state: WorkspaceState | undefined;
  connected: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  userId,
  children
}: {
  userId: string;
  children: ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const authQuery = useAuthQuery();
  const workspace = useAgent<Workspace, WorkspaceState>({
    agent: "Workspace",
    name: userId,
    ...authQuery,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    // Refresh the Notion status when its connection changes.
    onMcpUpdate: () => {
      workspace.stub.syncConnections().catch(() => {});
    }
  });

  const state = useMemo(() => withDefaults(workspace.state), [workspace.state]);

  return (
    <WorkspaceContext.Provider value={{ workspace, state, connected }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

// Agents saved by older versions may be missing newer fields, so fill in
// safe defaults instead of letting the page crash.
function withDefaults(
  state: WorkspaceState | undefined
): WorkspaceState | undefined {
  if (!state) return state;
  return {
    connections: state.connections ?? [],
    agents: (state.agents ?? []).map((a) => ({
      ...a,
      description: a.description ?? "",
      objective: a.objective ?? "",
      skills: a.skills ?? [],
      tools: a.tools ?? [],
      activeStep: a.activeStep ?? null,
      scheduleLabel: a.scheduleLabel ?? "Manual"
    }))
  };
}
