// What an agent remembers between runs, with a button to forget each item.
import { useEffect, useEffectEvent, useState } from "react";
import { Brain, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useWorkspace } from "@/lib/workspace-context";
import { fromNow, toastError } from "@/lib/format";
import type { AgentSummary, Memory } from "@/shared";

export default function AgentMemorySheet({
  agent,
  onClose
}: {
  agent: AgentSummary | null;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [memories, setMemories] = useState<Memory[] | null>(null);

  const agentId = agent?.id;
  const totalRuns = agent?.totalRuns;

  const load = useEffectEvent((id: string) => {
    workspace.stub
      .agentMemories(id)
      .then((m) => setMemories(m as Memory[]))
      .catch((e) => toastError(e, "Couldn't load memory"));
  });

  // Reload when a different agent opens or it finishes another run.
  useEffect(() => {
    setMemories(null);
    if (agentId) load(agentId);
  }, [agentId, totalRuns]);

  async function forget(id: number) {
    if (!agent) return;
    try {
      setMemories(
        (await workspace.stub.forgetAgentMemory(agent.id, id)) as Memory[]
      );
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <Sheet open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Brain className="size-4 text-brand" /> {agent?.name}'s memory
          </SheetTitle>
          <SheetDescription>
            Facts the agent saved after runs or chats. Stored in its own Durable
            Object.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          {memories === null && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          )}
          {memories?.length === 0 && (
            <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              Nothing remembered yet. Run the agent or tell it something to
              remember in chat.
            </div>
          )}
          {memories?.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm">{m.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  from {m.source} · {fromNow(m.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Forget"
                onClick={() => forget(m.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
