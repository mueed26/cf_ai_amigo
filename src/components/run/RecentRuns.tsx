// Table of recent runs with a "View" button for each result.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { RunStatusBadge } from "@/components/agents/shared";
import { agentImage, fromNow } from "@/lib/format";
import type { RunWithAgent } from "@/shared";
import AgentRunResultDialog from "./AgentRunResultDialog";

export default function RecentRuns({
  runs,
  loading
}: {
  runs: RunWithAgent[] | null;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<RunWithAgent | null>(null);

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold">Recent Runs</h2>
      <div className="mt-3 rounded-2xl border py-2">
        <Table>
          <TableCaption>
            {runs?.length === 0
              ? "No runs yet. Run an agent to see results here."
              : "All recent agent runs"}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs === null && loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-5">
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-44" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-10" />
                    </TableCell>
                  </TableRow>
                ))
              : runs?.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="p-4 font-medium">
                      <span className="flex items-center gap-2">
                        <img
                          src={agentImage(run.agentImage, run.agentName)}
                          alt=""
                          className="size-7 rounded-lg border bg-slate-50 p-0.5"
                        />
                        {run.agentName}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {run.task}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {run.trigger}
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>
                      {fromNow(run.completedAt ?? run.startedAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        className="h-auto px-0 text-brand"
                        onClick={() => setSelected(run)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <AgentRunResultDialog run={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
