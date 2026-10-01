// Grid of all the user's agents (from AMIGO AI's "My Agents").
import { Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/lib/workspace-context";
import { AgentCard, useAgentDialogs } from "./AgentCard";

export default function MyAgents({ onCreate }: { onCreate: () => void }) {
  const { state } = useWorkspace();
  const { openDialog, dialogs } = useAgentDialogs();
  const agents = state?.agents;

  return (
    <div className="mt-5">
      <h2 className="text-2xl font-bold">My Agents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Run, manage and update all the agents you've created.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        {agents === undefined &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="size-16 rounded-xl" />
                <Skeleton className="size-9 rounded-md" />
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-48" />
              <div className="flex gap-2.5">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </div>
          ))}

        {agents?.map((agent) => (
          <AgentCard key={agent.id} agent={agent} openDialog={openDialog} />
        ))}
      </div>

      {agents?.length === 0 && (
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-muted-foreground transition-colors hover:border-brand hover:text-brand"
        >
          <Bot className="size-8" />
          <span className="font-medium">
            No agents yet. Create your first one.
          </span>
        </button>
      )}

      {dialogs}
    </div>
  );
}
