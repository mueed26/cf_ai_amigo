// Create an agent: describe it, watch Llama 3.3 design it live, answer any
// questions, and the agent is created (layout from AMIGO AI).
import { useMemo, useState } from "react";
import {
  ArrowUp,
  BriefcaseBusiness,
  Loader2,
  Mail,
  Newspaper,
  RotateCcw,
  Search,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-context";
import { errorText, toastError, toastSuccess } from "@/lib/format";
import type { AgentSummary, ClarificationQuestion, PlanResult } from "@/shared";
import AIAgentQuestions from "./AIAgentQuestions";
import { AgentCard, useAgentDialogs } from "./AgentCard";

const quickSuggestions = [
  {
    label: "Inbox Summary",
    prompt:
      "Every morning at 8, summarize my unread Gmail from the last 24 hours and tell me what needs a reply."
  },
  {
    label: "HN → Google Doc",
    prompt:
      "Every Friday at 6pm, find the 5 most discussed Hacker News stories about AI this week and save a one-line summary of each to a new Google Doc."
  },
  {
    label: "Slack Digest",
    prompt:
      "Every Monday at 10am, post a short summary of the latest Cloudflare blog posts to #general on Slack."
  },
  {
    label: "Research Topic",
    prompt:
      "Research a topic across the web, compare multiple sources, and give me a concise summary with links."
  },
  {
    label: "Notion Notes",
    prompt:
      "Research the best free hosting options for a side project and save the comparison as a Notion page."
  }
];

const templates = [
  {
    title: "Find latest jobs",
    prompt:
      "Every Monday at 9am, search the web for new remote junior backend jobs (Go or Python) and list the best 5 with links.",
    description: "Search the web for the latest jobs matching my profile.",
    icon: BriefcaseBusiness,
    style: "bg-orange-100 text-orange-600",
    hover: "hover:border-orange-300 hover:shadow-orange-100"
  },
  {
    title: "Daily inbox summary",
    prompt:
      "Every morning at 8, summarize my important Gmail and highlight what needs my attention.",
    description:
      "Summarize important emails and highlight what needs attention.",
    icon: Mail,
    style: "bg-blue-100 text-blue-600",
    hover: "hover:border-blue-300 hover:shadow-blue-100"
  },
  {
    title: "Tech news briefing",
    prompt:
      "Every weekday at 9am, give me the top 5 Hacker News stories about AI with a one-line summary each.",
    description: "Top Hacker News stories, summarized every morning.",
    icon: Newspaper,
    style: "bg-purple-100 text-purple-600",
    hover: "hover:border-purple-300 hover:shadow-purple-100"
  },
  {
    title: "Research a topic",
    prompt:
      "Search the web for a topic I give you and create a short research summary with sources.",
    description: "Search the web and write a useful research summary.",
    icon: Search,
    style: "bg-emerald-100 text-emerald-600",
    hover: "hover:border-emerald-300 hover:shadow-emerald-100"
  }
];

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

type Phase = "idle" | "planning" | "questions" | "creating" | "done" | "error";

export default function CreateAgent() {
  const { workspace, state } = useWorkspace();
  const { openDialog, dialogs } = useAgentDialogs();
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveText, setLiveText] = useState("");
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The new agent's live summary, kept fresh by the Workspace connection.
  const createdAgent: AgentSummary | undefined = state?.agents.find(
    (a) => a.id === createdId
  );

  function plan(answers?: Record<string, string | string[]>) {
    if (!prompt.trim()) {
      toastError(
        "Describe what the agent should do first.",
        "Prompt is required"
      );
      return;
    }
    setPhase("planning");
    setLiveText("");
    setError(null);
    setCreatedId(null);

    // Send answers with their question text so the AI has context.
    const keyed = answers
      ? Object.fromEntries(
          questions
            .filter((q) => answers[q.id]?.length)
            .map((q) => [q.question, answers[q.id]])
        )
      : undefined;

    workspace
      .call("plan", [{ prompt, answers: keyed, timezone }], {
        stream: {
          onChunk: (chunk: unknown) => setLiveText((t) => t + String(chunk)),
          onDone: (result: unknown) => handlePlan(result as PlanResult),
          onError: (message: string) => {
            setError(message);
            setPhase("error");
          }
        }
      })
      .catch((e: unknown) => {
        setError(errorText(e));
        setPhase("error");
      });
  }

  async function handlePlan(result: PlanResult) {
    if (result.status === "needs_clarification") {
      setQuestions(result.questions);
      setPhase("questions");
      return;
    }
    setPhase("creating");
    try {
      const id = await workspace.stub.createAgent({
        config: result.config,
        timezone
      });
      setCreatedId(id);
      setPhase("done");
      toastSuccess(
        `${result.config.name} is ready!`,
        result.config.schedule.label
      );
    } catch (e) {
      setError(errorText(e));
      setPhase("error");
    }
  }

  function reset() {
    setPhase("idle");
    setPrompt("");
    setLiveText("");
    setCreatedId(null);
    setQuestions([]);
  }

  const busy = phase === "planning" || phase === "creating";

  return (
    <div className="mt-5">
      <div>
        <h2 className="text-2xl font-semibold">Create New Agent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the job in plain English. Llama 3.3 on Workers AI designs the
          agent, picks its tools and sets its schedule.
        </p>
      </div>

      <div className="mt-3 w-full rounded-2xl border bg-background p-3 shadow-lg shadow-orange-100 transition-shadow hover:shadow-orange-200">
        <textarea
          placeholder="Describe the agent you want to create..."
          className="min-h-[90px] w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) plan();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="px-2 text-xs text-muted-foreground">
            Ctrl + Enter to send
          </span>
          <Button
            disabled={busy}
            onClick={() => plan()}
            size="icon"
            className="size-9 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            aria-label="Design agent"
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickSuggestions.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            disabled={busy}
            onClick={() => setPrompt(s.prompt)}
            className="hover:border-brand hover:bg-brand-soft hover:text-brand"
          >
            {s.label}
          </Button>
        ))}
      </div>

      {(phase === "planning" || phase === "creating") && (
        <LivePlan text={liveText} creating={phase === "creating"} />
      )}

      {phase === "error" && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => plan()}>
            <RotateCcw /> Try again
          </Button>
        </div>
      )}

      {phase === "questions" && (
        <div className="mt-5 rounded-2xl border p-5">
          <AIAgentQuestions
            questionList={questions}
            onComplete={(answers) => plan(answers)}
          />
        </div>
      )}

      {phase === "done" && createdAgent && (
        <div className="mt-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-brand" /> Your new agent
            </h3>
            <Button variant="ghost" size="sm" onClick={reset}>
              Create another
            </Button>
          </div>
          <div className="max-w-md">
            <AgentCard agent={createdAgent} openDialog={openDialog} />
          </div>
        </div>
      )}

      {phase === "idle" && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Get Started</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.title}
                type="button"
                aria-label={t.title}
                onClick={() => setPrompt(t.prompt)}
                className={`rounded-2xl border p-5 text-left transition-shadow hover:shadow-lg ${t.hover}`}
              >
                <t.icon className={`size-12 rounded-xl p-2 ${t.style}`} />
                <div className="mt-6">
                  <h2 className="font-semibold text-foreground">{t.title}</h2>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    {t.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {dialogs}
    </div>
  );
}

// Shows the config as Llama writes it, with the fields filled in as they arrive.
function LivePlan({ text, creating }: { text: string; creating: boolean }) {
  const preview = useMemo(() => readPartial(text), [text]);
  const asking = /"status"\s*:\s*"needs_clarification"/.test(text);

  return (
    <div className="mt-7 overflow-hidden rounded-2xl border shadow-sm">
      <div className="h-1 animate-pulse bg-[linear-gradient(90deg,#f38020,#faad3f,#8b5cf6)]" />
      <div className="space-y-4 p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin text-brand" />
          {creating
            ? "Creating your agent…"
            : asking
              ? "Writing a few questions for you…"
              : "Generating agent config with Llama 3.3…"}
        </p>

        {(preview.name || preview.description) && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-lg font-semibold">{preview.name ?? "…"}</p>
            {preview.description && (
              <p className="text-sm text-muted-foreground">
                {preview.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand"
                >
                  {s}
                </span>
              ))}
              {preview.schedule && (
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                  {preview.schedule}
                </span>
              )}
            </div>
          </div>
        )}

        <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-slate-200">
          {text || " "}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-orange-400 align-middle" />
        </pre>
      </div>
    </div>
  );
}

// Pull finished string fields out of JSON that is still being written.
function readPartial(text: string) {
  const field = (key: string) =>
    text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
  const skillsBlock = text.match(/"skills"\s*:\s*\[([^\]]*)/)?.[1] ?? "";
  return {
    name: field("name"),
    description: field("description"),
    schedule: field("label"),
    skills: [...skillsBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
  };
}
