// Agent card (from AMIGO AI's "My Agents") and the dialogs it opens.
import { useState } from "react";
import {
  Brain,
  CalendarClock,
  Ellipsis,
  Loader2,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  PlaySquare,
  Trash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { agentImage, fromNow } from "@/lib/format";
import type { AgentSummary } from "@/shared";
import AgentChatDrawer from "./AgentChatDrawer";
import AgentEditSheet from "./AgentEditSheet";
import AgentMemorySheet from "./AgentMemorySheet";
import DeleteAgent from "./DeleteAgent";
import {
  AgentStatusBadge,
  ConnectPrompt,
  RunStatusBadge,
  ToolChips,
  useAgentActions
} from "./shared";

type DialogKind = "chat" | "edit" | "memory" | "delete";
type OpenDialog = (kind: DialogKind, agent: AgentSummary) => void;

// Holds which dialog is open, so cards can just call open("chat", agent).
export function useAgentDialogs() {
  const [open, setOpen] = useState<{
    kind: DialogKind;
    agent: AgentSummary;
  } | null>(null);
  const close = () => setOpen(null);
  const pick = (kind: DialogKind) => (open?.kind === kind ? open.agent : null);

  const dialogs = (
    <>
      <AgentChatDrawer agent={pick("chat")} onClose={close} />
      <AgentEditSheet agent={pick("edit")} onClose={close} />
      <AgentMemorySheet agent={pick("memory")} onClose={close} />
      <DeleteAgent agent={pick("delete")} onClose={close} />
    </>
  );
  return {
    openDialog: ((kind, agent) => setOpen({ kind, agent })) as OpenDialog,
    dialogs
  };
}

export function AgentCard({
  agent,
  openDialog
}: {
  agent: AgentSummary;
  openDialog: OpenDialog;
}) {
  const { busy, run, toggle } = useAgentActions();
  const running = !!agent.activeStep || busy === `run:${agent.id}`;

  return (
    <div className="flex flex-col rounded-2xl border bg-background p-3 shadow-sm transition-shadow hover:shadow-md hover:shadow-orange-100">
      <div className="flex items-center justify-between">
        <img
          src={agentImage(agent.image, agent.name)}
          alt={agent.name}
          className="size-16 rounded-xl border bg-slate-100 p-2"
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Agent menu" />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => run(agent)}>
                <Play /> Run Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggle(agent)}>
                {agent.status === "active" ? (
                  <>
                    <Pause /> Pause Agent
                  </>
                ) : (
                  <>
                    <PlaySquare /> Activate Agent
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDialog("edit", agent)}>
                <Pencil /> Edit Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDialog("memory", agent)}>
                <Brain /> View Memory
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => openDialog("delete", agent)}
              >
                <Trash /> Delete Agent
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="my-2 flex flex-1 flex-col">
        <h2 className="flex flex-wrap items-center gap-2 font-bold">
          {agent.name}
          <AgentStatusBadge status={agent.status} />
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {agent.description}
        </p>

        <div className="mt-3">
          <ToolChips tools={agent.tools} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-4 text-brand" />
            {agent.scheduleLabel}
            {agent.nextRunAt &&
              agent.status === "active" &&
              ` · next ${fromNow(agent.nextRunAt)}`}
          </span>
          <span className="flex items-center gap-1">
            Last run: <RunStatusBadge status={agent.lastRunStatus} />
          </span>
        </div>

        <div className="mt-3">
          <ConnectPrompt tools={agent.tools} />
        </div>

        <Separator className="my-3" />
        <div className="mt-auto flex w-full items-center gap-2.5">
          <Button
            variant="outline"
            className="flex-1"
            disabled={running}
            onClick={() => run(agent)}
          >
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {agent.activeStep
              ? capitalize(agent.activeStep)
              : running
                ? "Starting…"
                : "Run Agent"}
          </Button>
          <Button
            className="flex-1 bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => openDialog("chat", agent)}
          >
            <MessageCircle /> Chat With Agent
          </Button>
        </div>
      </div>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + "…";
