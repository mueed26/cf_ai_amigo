// Runs page: totals plus a table of every recent run.
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RecentRuns from "@/components/run/RecentRuns";
import { useRecentRuns } from "@/lib/use-recent-runs";
import { useWorkspace } from "@/lib/workspace-context";

export default function RunsPage() {
  const { state } = useWorkspace();
  const { runs, loading, reload } = useRecentRuns(100);
  const scheduled = (state?.agents ?? []).filter(
    (a) => a.status === "active" && a.nextRunAt
  ).length;

  const stats = [
    {
      label: "Completed",
      value: runs?.filter((r) => r.status === "completed").length,
      dot: "bg-green-600"
    },
    {
      label: "With errors",
      value: runs?.filter((r) => r.status === "partial").length,
      dot: "bg-amber-500"
    },
    {
      label: "Failed",
      value: runs?.filter((r) => r.status === "failed").length,
      dot: "bg-red-600"
    },
    {
      label: "Scheduled agents",
      value: state ? scheduled : undefined,
      dot: "bg-blue-600"
    }
  ];

  return (
    <div className="p-10 md:px-14 lg:px-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Agent Runs</h2>
          <p className="mt-1 text-muted-foreground">
            See what your agents are working on and review their results.
          </p>
        </div>
        <Button variant="outline" onClick={reload} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}{" "}
          Refresh
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">
        {stats.map((s) =>
          s.value === undefined ? (
            <Skeleton key={s.label} className="h-12 rounded-xl" />
          ) : (
            <div
              key={s.label}
              className="flex justify-between rounded-xl border p-3"
            >
              <div className="flex items-center gap-1.5">
                <div className={`size-3 rounded-full ${s.dot}`} />
                <h2>{s.label}</h2>
              </div>
              <h2 className="font-semibold">{s.value}</h2>
            </div>
          )
        )}
      </div>

      <RecentRuns runs={runs} loading={loading} />
    </div>
  );
}
