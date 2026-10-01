// "Are you sure?" dialog before deleting an agent.
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import type { AgentSummary } from "@/shared";
import { useAgentActions } from "./shared";

export default function DeleteAgent({
  agent,
  onClose
}: {
  agent: AgentSummary | null;
  onClose: () => void;
}) {
  const { busy, remove } = useAgentActions();
  const deleting = !!agent && busy === `delete:${agent.id}`;

  return (
    <AlertDialog open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {agent?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This can't be undone. The agent, its schedule, run history and
            memory will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={async () => {
              if (agent && (await remove(agent))) onClose();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
