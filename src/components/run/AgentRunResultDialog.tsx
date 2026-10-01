// Dialog showing one run's result, with any errors on top.
import { CalendarCheck, CircleAlert, ClipboardList } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Markdown } from "@/components/agents/AgentChatDrawer";
import { RunStatusBadge } from "@/components/agents/shared";
import { agentImage, formatDate } from "@/lib/format";
import type { RunWithAgent } from "@/shared";

export default function AgentRunResultDialog({
  run,
  onClose
}: {
  run: RunWithAgent | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!run} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={agentImage(run?.agentImage, run?.agentName ?? "agent")}
              alt=""
              className="size-11 rounded-xl border bg-white p-2"
            />
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg">
                {run?.agentName ?? "Agent run"}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                {run && <RunStatusBadge status={run.status} />}
                <span className="inline-flex items-center gap-1">
                  <CalendarCheck className="size-3.5" />
                  {formatDate(run?.completedAt ?? run?.startedAt)}
                </span>
                <span className="capitalize">· {run?.trigger} run</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(88vh-96px)] overflow-y-auto px-5 py-5">
          {run?.task && (
            <section className="mb-5 rounded-lg border bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ClipboardList className="size-4" /> Task
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {run.task}
              </p>
            </section>
          )}

          {run?.error && (
            <section
              className={`mb-5 rounded-lg border p-4 ${run.status === "partial" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}
            >
              <div
                className={`mb-2 flex items-center gap-2 text-sm font-semibold ${run.status === "partial" ? "text-amber-800" : "text-red-800"}`}
              >
                <CircleAlert className="size-4" />{" "}
                {run.status === "partial" ? "Some tools failed" : "Error"}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {run.error}
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Output
            </h3>
            {run?.output ? (
              <div className="rounded-lg border bg-white p-4">
                <Markdown text={run.output} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                {run?.status === "running"
                  ? "This run is still working…"
                  : "This run has no output."}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
