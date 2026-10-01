// Loads recent runs across all agents and reloads when any agent's runs change.
import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { toastError } from "@/lib/format";
import type { RunWithAgent } from "@/shared";

export function useRecentRuns(limit = 50) {
  const { workspace, state } = useWorkspace();
  const [runs, setRuns] = useState<RunWithAgent[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Changes whenever a run starts, moves to a new step or finishes.
  const changeKey = (state?.agents ?? [])
    .map((a) => `${a.id}:${a.totalRuns}:${a.lastRunStatus}:${a.activeStep}`)
    .join("|");

  async function reload() {
    if (!state) return;
    setLoading(true);
    try {
      setRuns((await workspace.stub.recentRuns(limit)) as RunWithAgent[]);
    } catch (e) {
      toastError(e, "Couldn't load runs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [changeKey, state !== undefined]);

  return { runs, loading, reload };
}
