// Dashboard home: greeting, totals, briefing and what's happening now.
import { useMemo, useState, type ElementType, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useUser } from "@clerk/react";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import AgentRunResultDialog from "@/components/run/AgentRunResultDialog";
import { agentImage, formatDate, fromNow } from "@/lib/format";
import { useRecentRuns } from "@/lib/use-recent-runs";
import { useWorkspace } from "@/lib/workspace-context";
import type { AgentSummary, RunWithAgent } from "@/shared";

export default function Overview() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { state } = useWorkspace();
  const { runs, loading, reload } = useRecentRuns(50);
  const [selected, setSelected] = useState<RunWithAgent | null>(null);
  const agents = useMemo(() => state?.agents ?? [], [state?.agents]);

  const data = useMemo(() => {
    const all = runs ?? [];
    // Same meaning as the Runs page: "completed" excludes runs with tool errors.
    const completed = all.filter((r) => r.status === "completed");
    const finished = all.filter(
      (r) => r.status === "completed" || r.status === "partial"
    );
    const attention = all.filter(
      (r) => r.status === "failed" || r.status === "partial"
    );
    const running = agents.filter((a) => a.activeStep);
    const upNext = agents
      .filter((a) => a.status === "active" && a.nextRunAt)
      .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!));
    return {
      completed,
      attention,
      running,
      upNext,
      latest: finished.slice(0, 4)
    };
  }, [runs, agents]);

  const firstName = user?.firstName ?? "there";
  const statCards = [
    {
      label: "Completed",
      value: data.completed.length,
      detail: "finished runs",
      icon: CheckCircle2,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      iconClassName: "bg-emerald-200/70 text-emerald-700"
    },
    {
      label: "Running",
      value: data.running.length,
      detail: "active right now",
      icon: Zap,
      className: "border-orange-200 bg-orange-50 text-orange-900",
      iconClassName: "bg-orange-200/70 text-orange-700"
    },
    {
      label: "Scheduled",
      value: data.upNext.length,
      detail: "agents on a schedule",
      icon: CalendarClock,
      className: "border-violet-200 bg-violet-50 text-violet-900",
      iconClassName: "bg-violet-200/70 text-violet-700"
    },
    {
      label: "Attention",
      value: data.attention.length,
      detail: "need review",
      icon: TriangleAlert,
      className: "border-amber-200 bg-amber-50 text-amber-900",
      iconClassName: "bg-amber-200/70 text-amber-700"
    }
  ];

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-5 py-8 md:px-10 lg:px-12">
      <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#fffaf5_0%,#fff1e6_36%,#f5f3ff_68%,#f0f9ff_100%)] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Clock3 className="size-4 text-brand" />
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric"
              })}
            </p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950 md:text-4xl">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Here's the latest from your agents, runs, schedules, and anything
              that needs a closer look.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-white/80 bg-white/80 shadow-sm hover:bg-white"
              onClick={reload}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
            <Button onClick={() => navigate("/dashboard/agents")}>
              <Plus /> New agent
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <MetricCard key={s.label} {...s} />
          ))}
        </div>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
        <div className="h-1.5 bg-[linear-gradient(90deg,#f38020,#faad3f,#8b5cf6,#0ea5e9)]" />
        <div className="flex gap-4 p-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-100">
            <Sparkles className="size-5 text-orange-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Your AI briefing</h2>
              <Badge className="bg-slate-100 text-slate-700">Live</Badge>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
              {briefing(agents, data)}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <StatusPill
                icon={<CheckCircle2 className="size-4" />}
                label={`${data.completed.length} completed`}
                className="bg-emerald-50 text-emerald-700"
              />
              <StatusPill
                icon={<Zap className="size-4" />}
                label={`${data.running.length} running`}
                className="bg-orange-50 text-orange-700"
              />
              <StatusPill
                icon={<TriangleAlert className="size-4" />}
                label={`${data.attention.length} need attention`}
                className="bg-amber-50 text-amber-700"
              />
              <Button
                variant="link"
                className="ml-auto px-0 text-brand"
                onClick={() => navigate("/dashboard/runs")}
              >
                View all runs <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,640px)_minmax(300px,1fr)]">
        <main className="min-w-0 space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xl font-semibold">Needs your attention</h2>
              <Badge className="bg-amber-100 text-amber-700">
                {data.attention.length}
              </Badge>
            </div>
            {data.attention[0] ? (
              <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Identity
                  image={data.attention[0].agentImage}
                  name={data.attention[0].agentName}
                  subtitle={data.attention[0].error ?? "This run needs a look."}
                  dot="bg-orange-500"
                />
                <Button
                  variant="outline"
                  className="border-amber-200 bg-white/80 hover:bg-white"
                  onClick={() => setSelected(data.attention[0])}
                >
                  Review run
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle2 className="size-4 text-emerald-600" />}
                text="No runs need attention right now."
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              />
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Latest results</h2>
              <Badge className="bg-emerald-100 text-emerald-700">
                {data.latest.length}
              </Badge>
            </div>
            <div className="divide-y overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {data.latest.length > 0 ? (
                data.latest.map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <Identity
                      image={run.agentImage}
                      name={run.agentName}
                      subtitle={summary(run.output)}
                      dot={
                        run.status === "partial"
                          ? "bg-amber-500"
                          : "bg-green-500"
                      }
                    />
                    <div className="flex items-center gap-4 sm:shrink-0">
                      <span className="text-sm text-muted-foreground">
                        {fromNow(run.completedAt ?? run.startedAt)}
                      </span>
                      <Button
                        variant="link"
                        className="px-0 text-brand"
                        onClick={() => setSelected(run)}
                      >
                        View result
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<Bot className="size-4 text-slate-500" />}
                  text="Completed run results will appear here."
                  className="border-0"
                />
              )}
            </div>
          </section>
        </main>

        <aside className="min-w-0 space-y-8">
          <section>
            <h2 className="mb-3 text-xl font-semibold">Running now</h2>
            {data.running[0] ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <Identity
                  image={data.running[0].image}
                  name={data.running[0].name}
                  subtitle={data.running[0].objective}
                  dot="bg-blue-600"
                />
                <div className="mt-5 flex items-center gap-3">
                  <Progress
                    value={stepProgress(data.running[0].activeStep)}
                    className="flex-1 bg-white"
                  />
                  <span className="text-sm font-medium capitalize text-orange-800">
                    {data.running[0].activeStep}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Zap className="size-4 text-orange-600" />}
                text="No agents are running right now."
                className="border-orange-200 bg-orange-50 text-orange-700"
              />
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Up next</h2>
            <div className="divide-y overflow-hidden rounded-xl border border-violet-200 bg-white">
              {data.upNext.length > 0 ? (
                data.upNext.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-violet-50"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                      <CalendarClock className="size-4 text-violet-700" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">
                        {a.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(a.nextRunAt)} ({fromNow(a.nextRunAt)})
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<CalendarClock className="size-4 text-violet-600" />}
                  text="Scheduled runs will appear here."
                  className="border-0 text-violet-700"
                />
              )}
            </div>
          </section>
        </aside>
      </div>

      <AgentRunResultDialog run={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  className,
  iconClassName
}: {
  label: string;
  value: number;
  detail: string;
  icon: ElementType;
  className: string;
  iconClassName: string;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-lg ${iconClassName}`}
        >
          <Icon className="size-5" />
        </div>
        <span className="text-3xl font-bold leading-none">{value}</span>
      </div>
      <h3 className="mt-4 text-sm font-semibold">{label}</h3>
      <p className="text-xs opacity-70">{detail}</p>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  className
}: {
  icon: ReactNode;
  label: string;
  className: string;
}) {
  return (
    <span
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

function Identity({
  image,
  name,
  subtitle,
  dot
}: {
  image?: string | null;
  name: string;
  subtitle: string;
  dot: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="relative shrink-0">
        <img
          src={agentImage(image, name)}
          alt={name}
          className="size-12 rounded-xl border bg-white p-2 shadow-sm"
        />
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white ${dot}`}
        />
      </div>
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{name}</h3>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  text,
  className = ""
}: {
  icon: ReactNode;
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground ${className}`}
    >
      {icon}
      {text}
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function stepProgress(step: string | null) {
  return (
    { queued: 10, "loading context": 25, working: 60, "updating memory": 90 }[
      step ?? ""
    ] ?? 40
  );
}

// First real line of a run's output, without Markdown symbols.
function summary(output: string | null) {
  const line =
    (output ?? "").split("\n").find((l) => l.trim()) ??
    "Result is ready to review.";
  return line.replace(/[#*_`>]/g, "").trim();
}

function briefing(
  agents: AgentSummary[],
  data: {
    completed: unknown[];
    running: AgentSummary[];
    attention: unknown[];
    upNext: AgentSummary[];
  }
) {
  if (agents.length === 0) {
    return "You don't have any agents yet. Create one from a single sentence and its results, live runs and schedule will show up here.";
  }
  const running = data.running[0]
    ? `${data.running[0].name} is running right now.`
    : "No agents are running right now.";
  const attention = data.attention.length
    ? `${data.attention.length} ${data.attention.length === 1 ? "run needs" : "runs need"} a look.`
    : "Everything looks clear.";
  const next = data.upNext[0]
    ? `Next up: ${data.upNext[0].name} ${fromNow(data.upNext[0].nextRunAt)}.`
    : "";
  return `You have ${agents.length} ${agents.length === 1 ? "agent" : "agents"} and they finished ${data.completed.length} ${data.completed.length === 1 ? "run" : "runs"} recently. ${running} ${attention} ${next}`;
}
