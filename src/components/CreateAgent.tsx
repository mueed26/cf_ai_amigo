/**
 * Prompt -> (clarifying questions) -> reviewable config -> live agent.
 * Mirrors AMIGO AI's creation flow, planned by Llama 3.3 in the Workspace agent.
 */
import { useState } from "react";
import { Badge, Button, InputArea, Surface, Text } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  ClockIcon,
  LightningIcon,
  MagicWandIcon,
  SparkleIcon,
  WrenchIcon
} from "@phosphor-icons/react";
import {
  TOOL_CATALOG,
  type AgentConfig,
  type ClarificationQuestion,
  type ToolSlug
} from "../shared";
import { errorMessage } from "./ui";

type WorkspaceStub = {
  plan(input: {
    prompt: string;
    answers?: Record<string, string | string[]>;
    timezone: string;
  }): Promise<
    | { status: "needs_clarification"; questions: ClarificationQuestion[] }
    | { status: "ready"; config: AgentConfig }
  >;
  createAgent(input: {
    config: AgentConfig;
    timezone: string;
  }): Promise<string>;
};

const EXAMPLES = [
  "Every weekday at 9am, give me the top 5 Hacker News stories about AI with a one-line summary each",
  "Every Monday at 8am, find new remote junior backend jobs (Go or Python) and list the best 5",
  "Summarize the latest Cloudflare blog posts every Friday evening",
  "Compare current prices of the iPhone 17 across major Indian retailers"
];

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CreateAgent({
  workspace,
  onCreated,
  onCancel
}: {
  workspace: WorkspaceStub;
  onCreated: (id: string) => void;
  onCancel?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<ClarificationQuestion[] | null>(
    null
  );
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState<"plan" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function plan(withAnswers?: Record<string, string | string[]>) {
    setBusy("plan");
    setError(null);
    try {
      // Answers are keyed by question text so the planner sees what was asked.
      const keyed =
        withAnswers && questions
          ? Object.fromEntries(
              questions
                .filter((q) => withAnswers[q.id]?.length)
                .map((q) => [q.question, withAnswers[q.id]])
            )
          : undefined;
      const result = await workspace.plan({ prompt, answers: keyed, timezone });
      if (result.status === "ready") {
        setConfig(result.config);
        setQuestions(null);
      } else {
        setQuestions(result.questions);
        setAnswers({});
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!config) return;
    setBusy("create");
    setError(null);
    try {
      onCreated(await workspace.createAgent({ config, timezone }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setQuestions(null);
    setConfig(null);
    setAnswers({});
    setError(null);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        {onCancel && (
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            aria-label="Back"
            icon={<ArrowLeftIcon size={16} />}
            onClick={onCancel}
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-kumo-default">
            Create an agent
          </h2>
          <Text size="sm" variant="secondary">
            Describe a job in plain English. Llama 3.3 designs the agent, picks
            its tools and sets its schedule.
          </Text>
        </div>
      </div>

      {/* Step 1 — prompt */}
      <Surface className="rounded-xl ring ring-kumo-line p-4 space-y-3">
        <InputArea
          value={prompt}
          onValueChange={(v) => {
            setPrompt(v);
            if (questions || config) reset();
          }}
          placeholder="e.g. Every morning at 8, check the weather in Bangalore and tell me if I need an umbrella"
          rows={3}
          disabled={busy !== null}
          aria-label="Describe your agent"
          className="w-full"
        />
        {!prompt && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="text-left text-xs px-3 py-1.5 rounded-full border border-kumo-line text-kumo-subtle hover:text-kumo-default hover:border-kumo-brand transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        {!questions && !config && (
          <div className="flex justify-end">
            <Button
              variant="primary"
              icon={<MagicWandIcon size={16} />}
              disabled={!prompt.trim() || busy !== null}
              onClick={() => plan()}
            >
              {busy === "plan" ? "Designing agent…" : "Design agent"}
            </Button>
          </div>
        )}
      </Surface>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Step 2 — clarifying questions */}
      {questions && (
        <Surface className="rounded-xl ring ring-kumo-line p-4 space-y-5">
          <div className="flex items-center gap-2">
            <SparkleIcon size={16} className="text-kumo-brand" />
            <Text bold>A few quick questions</Text>
          </div>
          {questions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            />
          ))}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => plan({})}
              disabled={busy !== null}
            >
              Skip — use defaults
            </Button>
            <Button
              variant="primary"
              icon={<MagicWandIcon size={16} />}
              onClick={() => plan(answers)}
              disabled={busy !== null}
            >
              {busy === "plan" ? "Designing agent…" : "Continue"}
            </Button>
          </div>
        </Surface>
      )}

      {/* Step 3 — review & create */}
      {config && (
        <ConfigReview
          config={config}
          onChange={setConfig}
          onCreate={create}
          onRedo={() => plan()}
          busy={busy}
        />
      )}
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange
}: {
  question: ClarificationQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const isMulti = question.type === "multi_select";
  const custom = selected.find((s) => !question.options.includes(s)) ?? "";

  function toggle(option: string) {
    if (isMulti) {
      onChange(
        selected.includes(option)
          ? selected.filter((s) => s !== option)
          : [...selected, option]
      );
    } else {
      onChange(option);
    }
  }

  return (
    <div className="space-y-2">
      <Text size="sm" bold>
        {question.question}
      </Text>
      {question.options.length > 0 && question.type !== "text" && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                selected.includes(option)
                  ? "border-kumo-brand bg-kumo-brand/10 text-kumo-default"
                  : "border-kumo-line text-kumo-subtle hover:text-kumo-default"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      {(question.allowCustom ||
        question.type === "text" ||
        question.options.length === 0) && (
        <input
          type="text"
          value={question.type === "text" ? (selected[0] ?? "") : custom}
          onChange={(e) => {
            const v = e.target.value;
            if (question.type === "text" || !isMulti) onChange(v);
            else
              onChange([
                ...selected.filter((s) => question.options.includes(s)),
                v
              ]);
          }}
          placeholder="Type your own answer"
          aria-label={question.question}
          className="w-full px-3 py-2 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-ring"
        />
      )}
    </div>
  );
}

function ConfigReview({
  config,
  onChange,
  onCreate,
  onRedo,
  busy
}: {
  config: AgentConfig;
  onChange: (c: AgentConfig) => void;
  onCreate: () => void;
  onRedo: () => void;
  busy: "plan" | "create" | null;
}) {
  function toggleTool(slug: ToolSlug) {
    const tools = config.tools.includes(slug)
      ? config.tools.filter((t) => t !== slug)
      : [...config.tools, slug];
    onChange({ ...config, tools });
  }

  return (
    <Surface className="rounded-xl ring ring-kumo-line p-4 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={config.name}
            onChange={(e) => onChange({ ...config, name: e.target.value })}
            aria-label="Agent name"
            className="w-full bg-transparent text-lg font-semibold text-kumo-default focus:outline-none"
          />
          <Text size="sm" variant="secondary">
            {config.description}
          </Text>
        </div>
        <Badge variant="primary">Ready</Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {config.skills.map((s) => (
          <Badge key={s} variant="secondary">
            {s}
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-kumo-subtle">
            <ClockIcon size={14} />
            <Text size="xs" variant="secondary" bold>
              SCHEDULE
            </Text>
          </div>
          <Text size="sm">
            {config.schedule.label}
            {config.schedule.cron && (
              <span className="ml-2 font-mono text-xs text-kumo-subtle">
                {config.schedule.cron}
              </span>
            )}
            {config.schedule.runAt && (
              <span className="ml-2 font-mono text-xs text-kumo-subtle">
                {config.schedule.runAt}
              </span>
            )}
          </Text>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-kumo-subtle">
            <WrenchIcon size={14} />
            <Text size="xs" variant="secondary" bold>
              TOOLS
            </Text>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_CATALOG.map((t) => (
              <button
                key={t.slug}
                type="button"
                title={t.description}
                onClick={() => toggleTool(t.slug)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  config.tools.includes(t.slug)
                    ? "border-kumo-brand bg-kumo-brand/10 text-kumo-default"
                    : "border-kumo-line text-kumo-inactive line-through"
                }`}
              >
                {t.name}
              </button>
            ))}
            <span className="text-xs px-2 py-1 rounded-md border border-kumo-line text-kumo-subtle">
              Memory (always on)
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Text size="xs" variant="secondary" bold>
          OBJECTIVE
        </Text>
        <textarea
          value={config.objective}
          onChange={(e) => onChange({ ...config, objective: e.target.value })}
          rows={2}
          aria-label="Objective"
          className="w-full px-3 py-2 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
        />
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm text-kumo-subtle select-none">
          Instructions & output format
        </summary>
        <div className="mt-3 space-y-3">
          <textarea
            value={config.instructions}
            onChange={(e) =>
              onChange({ ...config, instructions: e.target.value })
            }
            rows={8}
            aria-label="Instructions"
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
          />
          <textarea
            value={config.outputFormat}
            onChange={(e) =>
              onChange({ ...config, outputFormat: e.target.value })
            }
            rows={2}
            aria-label="Output format"
            className="w-full px-3 py-2 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
          />
        </div>
      </details>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onRedo} disabled={busy !== null}>
          {busy === "plan" ? "Redesigning…" : "Redesign"}
        </Button>
        <Button
          variant="primary"
          icon={<LightningIcon size={16} />}
          onClick={onCreate}
          disabled={busy !== null || !config.name.trim()}
        >
          {busy === "create" ? "Creating…" : "Create agent"}
        </Button>
      </div>
    </Surface>
  );
}
