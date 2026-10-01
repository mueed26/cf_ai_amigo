// Public landing page, shown before sign-in.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "@clerk/react";
import {
  ArrowRight,
  Blocks,
  Bot,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Cloud,
  Database,
  Play,
  Sparkles,
  Workflow,
  Zap
} from "lucide-react";

const demoAgents = [
  {
    name: "Inbox Scout",
    task: "Summarize unread Gmail every morning",
    state: "Running",
    color: "bg-orange-100 text-orange-800"
  },
  {
    name: "HN Pulse",
    task: "Top AI stories → Google Doc",
    state: "Scheduled",
    color: "bg-violet-100 text-violet-800"
  },
  {
    name: "Team Digest",
    task: "Post a weekly update to #general",
    state: "Ready",
    color: "bg-emerald-100 text-emerald-800"
  }
];

const features = [
  {
    icon: Bot,
    title: "Describe it, get an agent",
    text: "Llama 3.3 turns one sentence into an agent with instructions, tools and a schedule, and asks when something's unclear.",
    className: "bg-orange-50 text-orange-700"
  },
  {
    icon: CalendarClock,
    title: "Runs on its own",
    text: "Agents wake up on schedule and run step by step with automatic retries, even if something fails halfway.",
    className: "bg-sky-50 text-sky-700"
  },
  {
    icon: Blocks,
    title: "Works with your apps",
    text: "Gmail, Google Docs, Notion, Slack, Hacker News and the open web, with you approving anything sent on your behalf.",
    className: "bg-emerald-50 text-emerald-700"
  }
];

const stack = [
  {
    icon: BrainCircuit,
    name: "Workers AI",
    text: "Llama 3.3 70B plans, runs and chats"
  },
  {
    icon: Database,
    name: "Durable Objects",
    text: "Each agent keeps its own SQLite memory"
  },
  {
    icon: Workflow,
    name: "Workflows",
    text: "Durable, retried runs, step by step"
  },
  { icon: Cloud, name: "Agents SDK", text: "Scheduling, MCP, WebSockets, chat" }
];

export default function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = isLoaded && isSignedIn;

  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-950">
      <section className="relative min-h-screen border-b border-slate-200 bg-[linear-gradient(180deg,#fffdf8_0%,#fff3e8_44%,#f7f3ff_100%)]">
        <div className="absolute inset-0 opacity-[0.2] [background-image:linear-gradient(#0f172a_1px,transparent_1px),linear-gradient(90deg,#0f172a_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 md:px-8">
          <header className="flex h-20 items-center justify-between gap-4">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <img src="/logo.svg" alt="AMIGO logo" width={38} height={38} />
              <span className="truncate text-lg font-semibold">AMIGO</span>
              <span className="hidden rounded-full border border-orange-200 bg-white/70 px-2 py-0.5 text-xs font-semibold text-orange-700 sm:inline">
                on Cloudflare
              </span>
            </Link>

            <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
              <a
                href="#agents"
                className="transition-colors hover:text-slate-950"
              >
                Agents
              </a>
              <a
                href="#workflow"
                className="transition-colors hover:text-slate-950"
              >
                How it works
              </a>
              <a
                href="#stack"
                className="transition-colors hover:text-slate-950"
              >
                Built on Cloudflare
              </a>
            </nav>

            <div className="flex items-center gap-2">
              {signedIn ? (
                <PrimaryLink to="/dashboard">
                  Open dashboard <ArrowRight className="size-4" />
                </PrimaryLink>
              ) : (
                <>
                  <Link
                    to="/sign-in"
                    className="hidden h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-white/70 sm:inline-flex"
                  >
                    Sign in
                  </Link>
                  <PrimaryLink to="/sign-up">
                    Start free <ArrowRight className="size-4" />
                  </PrimaryLink>
                </>
              )}
            </div>
          </header>

          <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)] lg:py-12">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/75 px-3 py-1 text-sm font-medium text-orange-800 shadow-sm">
                <Sparkles className="size-4" />
                AI agents that run on Cloudflare's network
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.02] text-slate-950 md:text-7xl">
                Describe a job. AMIGO builds the agent and keeps it running.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-700 md:text-lg">
                Tell AMIGO what you need in plain English. It designs an AI
                agent, connects your apps, runs it on a schedule and remembers
                what it learned.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {signedIn ? (
                  <>
                    <PrimaryLink to="/dashboard/agents" large>
                      Manage agents <ArrowRight className="size-4" />
                    </PrimaryLink>
                    <SecondaryLink to="/dashboard/runs">
                      View runs
                    </SecondaryLink>
                  </>
                ) : (
                  <>
                    <PrimaryLink to="/sign-up" large>
                      Create your first agent <ArrowRight className="size-4" />
                    </PrimaryLink>
                    <SecondaryLink to="/sign-in">Sign in</SecondaryLink>
                  </>
                )}
              </div>

              <div className="mt-9 grid max-w-xl grid-cols-3 gap-3 text-sm">
                <Stat value="Llama 3.3" label="on Workers AI" />
                <Stat value="24/7" label="scheduled runs" />
                <Stat value="$0" label="runs on the free plan" />
              </div>
            </div>

            <div className="relative" id="agents">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-orange-200/50">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <img src="/logo.svg" alt="" width={24} height={24} />
                    <span className="text-sm font-semibold">Agent command</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="size-2 rounded-full bg-orange-400" />
                    Live on the edge
                  </div>
                </div>

                <div className="grid gap-0 md:grid-cols-[190px_minmax(0,1fr)]">
                  <aside className="hidden border-r border-slate-200 bg-slate-50 p-4 md:block">
                    {["Dashboard", "Agents", "Runs", "Integrations"].map(
                      (item, index) => (
                        <div
                          key={item}
                          className={`mb-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${index === 1 ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}
                        >
                          <span
                            className={`size-2 rounded-full ${["bg-orange-500", "bg-emerald-500", "bg-rose-500", "bg-violet-500"][index]}`}
                          />
                          {item}
                        </div>
                      )
                    )}
                  </aside>

                  <div className="min-w-0 p-4 md:p-5">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-500">
                          Today's briefing
                        </p>
                        <h2 className="mt-1 text-2xl font-bold">
                          3 agents ready to run
                        </h2>
                      </div>
                      <span className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white">
                        <Play className="size-4" />
                        Run now
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      {demoAgents.map((agent) => (
                        <div
                          key={agent.name}
                          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <Bot className="size-5 text-slate-800" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold">
                              {agent.name}
                            </h3>
                            <p className="truncate text-sm text-slate-500">
                              {agent.task}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${agent.color}`}
                          >
                            {agent.state}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <MiniMetric
                        icon={<CheckCircle2 className="size-4" />}
                        label="Completed"
                        value="18"
                        className="bg-emerald-50 text-emerald-800"
                      />
                      <MiniMetric
                        icon={<Zap className="size-4" />}
                        label="Running"
                        value="2"
                        className="bg-orange-50 text-orange-800"
                      />
                      <MiniMetric
                        icon={<CalendarClock className="size-4" />}
                        label="Scheduled"
                        value="9"
                        className="bg-violet-50 text-violet-800"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-16 md:grid-cols-3 md:px-8"
      >
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div
              className={`mb-5 flex size-11 items-center justify-center rounded-lg ${feature.className}`}
            >
              <feature.icon className="size-5" />
            </div>
            <h2 className="text-lg font-semibold">{feature.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {feature.text}
            </p>
          </div>
        ))}
      </section>

      <section id="stack" className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-14 md:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-600">
            Built on Cloudflare
          </p>
          <h2 className="mt-2 text-3xl font-bold">
            Every part runs on Cloudflare's developer platform.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stack.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border border-orange-100 bg-orange-50/50 p-5"
              >
                <item.icon className="size-6 text-orange-600" />
                <h3 className="mt-4 font-semibold">{item.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-[#fbfaf7]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Ready when you are
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              Launch your first agent in a minute.
            </h2>
          </div>
          <PrimaryLink to={signedIn ? "/dashboard" : "/sign-up"} large>
            {signedIn ? "Go to dashboard" : "Get started"}{" "}
            <ArrowRight className="size-4" />
          </PrimaryLink>
        </div>
      </section>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500 md:px-8">
          <span>
            AMIGO on Cloudflare · built for the Cloudflare AI application
            assignment
          </span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <a
              href="https://github.com/mueed26/cf_ai_amigo"
              className="hover:text-slate-900"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PrimaryLink({
  to,
  children,
  large
}: {
  to: string;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-slate-950 font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 ${large ? "h-11 px-5 text-sm" : "h-9 px-3 text-sm"}`}
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white/75 px-5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-white"
    >
      {children}
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/65 p-3 shadow-sm">
      <p className="text-2xl font-bold leading-none text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-medium leading-4 text-slate-600">
        {label}
      </p>
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  className
}: {
  icon: ReactNode;
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {icon}
        <span className="text-xl font-bold leading-none">{value}</span>
      </div>
      <p className="mt-3 text-xs font-semibold">{label}</p>
    </div>
  );
}
