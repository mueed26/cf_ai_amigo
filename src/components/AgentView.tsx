/**
 * One agent: live state over WebSocket (useAgent), chat (useAgentChat),
 * run history and long-term memory (callables backed by SQLite).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  Surface,
  Switch,
  Text
} from "@cloudflare/kumo";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  BrainIcon,
  ChatCircleDotsIcon,
  ClockCounterClockwiseIcon,
  GearIcon,
  PaperPlaneRightIcon,
  PlayIcon,
  SpinnerGapIcon,
  StopIcon,
  TrashIcon,
  WrenchIcon,
  XIcon
} from "@phosphor-icons/react";
import type { AmigoAgent } from "../agents/amigo-agent";
import {
  TOOL_CATALOG,
  type AgentRun,
  type AmigoAgentState,
  type Memory
} from "../shared";
import { RunStatusBadge, errorMessage, formatDate, relativeTime } from "./ui";

type Tab = "runs" | "chat" | "memory" | "config";

export function AgentView({
  id,
  onDelete
}: {
  id: string;
  onDelete: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("runs");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const agent = useAgent<AmigoAgent, AmigoAgentState>({
    agent: "AmigoAgent",
    name: id,
    onMessage: useCallback((message: MessageEvent) => {
      try {
        if (JSON.parse(String(message.data)).type === "run-finished")
          setRefreshKey((k) => k + 1);
      } catch {
        // not one of our events
      }
    }, [])
  });
  const state = agent.state;

  // Reload SQLite-backed lists on open, after runs finish and when switching tabs.
  useEffect(() => {
    if (!state?.config) return;
    agent.stub
      .listRuns(25)
      .then(setRuns)
      .catch(() => {});
    agent.stub
      .listMemories()
      .then(setMemories)
      .catch(() => {});
  }, [agent.stub, state?.config, state?.activeRun?.runId, refreshKey, tab]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!state?.config) {
    return (
      <div className="flex items-center justify-center h-full text-kumo-inactive gap-2">
        <SpinnerGapIcon size={18} className="animate-spin" /> Connecting to
        agent…
      </div>
    );
  }

  const { config, activeRun } = state;
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "runs",
      label: "Runs",
      icon: <ClockCounterClockwiseIcon size={14} />
    },
    { id: "chat", label: "Chat", icon: <ChatCircleDotsIcon size={14} /> },
    {
      id: "memory",
      label: `Memory (${memories.length})`,
      icon: <BrainIcon size={14} />
    },
    { id: "config", label: "Config", icon: <GearIcon size={14} /> }
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-6 pb-3 border-b border-kumo-line bg-kumo-base">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-semibold text-kumo-default truncate">
                {config.name}
              </h2>
              <Text size="sm" variant="secondary">
                {config.description}
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-kumo-subtle">
                <Switch
                  checked={state.status === "active"}
                  onCheckedChange={(on) =>
                    act(() => agent.stub.setStatus(on ? "active" : "paused"))
                  }
                  size="sm"
                  aria-label="Agent active"
                />
                {state.status === "active" ? "Active" : "Paused"}
              </label>
              <Button
                variant="primary"
                size="sm"
                icon={
                  activeRun ? (
                    <SpinnerGapIcon size={14} className="animate-spin" />
                  ) : (
                    <PlayIcon size={14} />
                  )
                }
                disabled={!!activeRun}
                onClick={() =>
                  act(async () => {
                    await agent.stub.runNow();
                    setTab("runs");
                  })
                }
              >
                {activeRun ? activeRun.step : "Run now"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                aria-label="Delete agent"
                icon={<TrashIcon size={14} />}
                onClick={() => {
                  if (
                    confirm(
                      `Delete "${config.name}"? Its runs and memory will be lost.`
                    )
                  ) {
                    act(onDelete);
                  }
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-kumo-subtle">
            <span>
              Schedule:{" "}
              <span className="text-kumo-default">{config.schedule.label}</span>
            </span>
            <span>
              Next run:{" "}
              <span className="text-kumo-default">
                {state.status === "paused"
                  ? "paused"
                  : state.nextRunAt
                    ? `${formatDate(state.nextRunAt, state.timezone)} (${relativeTime(state.nextRunAt)})`
                    : "—"}
              </span>
            </span>
            <span>
              Timezone:{" "}
              <span className="text-kumo-default">{state.timezone}</span>
            </span>
          </div>
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <nav className="flex gap-1 -mb-3 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "border-kumo-brand text-kumo-default"
                    : "border-transparent text-kumo-subtle hover:text-kumo-default"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "chat" ? (
          <ChatPanel agent={agent} agentName={config.name} />
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
              {tab === "runs" && (
                <RunsPanel runs={runs} timezone={state.timezone} />
              )}
              {tab === "memory" && (
                <MemoryPanel
                  memories={memories}
                  onForget={(mid) =>
                    act(async () =>
                      setMemories(await agent.stub.forgetMemory(mid))
                    )
                  }
                />
              )}
              {tab === "config" && <ConfigPanel state={state} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunsPanel({ runs, timezone }: { runs: AgentRun[]; timezone: string }) {
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null);
  useEffect(() => setOpen((o) => o ?? runs[0]?.id ?? null), [runs]);

  if (runs.length === 0) {
    return (
      <Empty
        icon={<ClockCounterClockwiseIcon size={32} />}
        title="No runs yet"
        contents={
          <Text size="sm" variant="secondary">
            Hit “Run now”, or wait for the schedule. Each run executes as a
            durable Cloudflare Workflow.
          </Text>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <Surface
          key={run.id}
          className="rounded-xl ring ring-kumo-line overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setOpen(open === run.id ? null : run.id)}
            className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <RunStatusBadge status={run.status} />
              <Badge variant="secondary">{run.trigger}</Badge>
            </div>
            <Text size="xs" variant="secondary">
              {formatDate(run.startedAt, timezone)}
              {run.completedAt &&
                ` · ${Math.max(1, Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))}s`}
            </Text>
          </button>
          {open === run.id && (
            <div className="px-4 pb-4 border-t border-kumo-line pt-3">
              {run.status === "running" && (
                <Text size="sm" variant="secondary">
                  Running…
                </Text>
              )}
              {run.error && (
                <pre className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
                  {run.error}
                </pre>
              )}
              {run.output && (
                <Streamdown
                  className="sd-theme text-sm"
                  plugins={{ code }}
                  controls={false}
                >
                  {run.output}
                </Streamdown>
              )}
            </div>
          )}
        </Surface>
      ))}
    </div>
  );
}

function MemoryPanel({
  memories,
  onForget
}: {
  memories: Memory[];
  onForget: (id: number) => void;
}) {
  if (memories.length === 0) {
    return (
      <Empty
        icon={<BrainIcon size={32} />}
        title="Memory is empty"
        contents={
          <Text size="sm" variant="secondary">
            After each run the agent reflects and stores durable facts here (in
            its Durable Object's SQLite). You can also tell it to remember
            things in chat.
          </Text>
        }
      />
    );
  }
  return (
    <div className="space-y-2">
      {memories.map((m) => (
        <div
          key={m.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-kumo-line px-3 py-2"
        >
          <div className="min-w-0">
            <Text size="sm">{m.content}</Text>
            <Text size="xs" variant="secondary">
              from {m.source} · {relativeTime(m.createdAt)}
            </Text>
          </div>
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Forget"
            icon={<XIcon size={12} />}
            onClick={() => onForget(m.id)}
          />
        </div>
      ))}
    </div>
  );
}

function ConfigPanel({ state }: { state: AmigoAgentState }) {
  const config = state.config!;
  const rows: [string, React.ReactNode][] = [
    ["Objective", config.objective],
    [
      "Schedule",
      <>
        {config.schedule.label}{" "}
        <span className="font-mono text-xs text-kumo-subtle">
          {config.schedule.cron ?? config.schedule.runAt ?? ""}
        </span>
      </>
    ],
    [
      "Tools",
      <div key="tools" className="flex flex-wrap gap-1.5">
        {config.tools.map((t) => (
          <Badge key={t} variant="secondary">
            <WrenchIcon size={10} className="mr-1" />
            {TOOL_CATALOG.find((c) => c.slug === t)?.name ?? t}
          </Badge>
        ))}
        <Badge variant="secondary">
          <BrainIcon size={10} className="mr-1" />
          Memory
        </Badge>
      </div>
    ],
    ["Skills", config.skills.join(" · ")],
    ["Output format", config.outputFormat],
    ["Created", formatDate(state.createdAt, state.timezone)]
  ];
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr] text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-kumo-subtle">{k}</dt>
            <dd className="text-kumo-default">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Text size="xs" variant="secondary" bold>
          SYSTEM INSTRUCTIONS
        </Text>
        <pre className="mt-1 p-3 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap">
          {config.instructions}
        </pre>
      </div>
    </div>
  );
}

function ChatPanel({
  agent,
  agentName
}: {
  agent: ReturnType<typeof useAgent<AmigoAgent, AmigoAgentState>>;
  agentName: string;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({
    agent,
    experimental_throttle: 100
  });
  const streaming = status === "streaming" || status === "submitted";

  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages]
  );

  function send(text = input) {
    if (!text.trim() || streaming) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.length === 0 && (
            <Empty
              icon={<ChatCircleDotsIcon size={32} />}
              title={`Chat with ${agentName}`}
              contents={
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "Do your task now",
                    "What do you remember?",
                    "Remember that I prefer short bullet points"
                  ].map((p) => (
                    <Button
                      key={p}
                      variant="outline"
                      size="sm"
                      onClick={() => send(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              }
            />
          )}
          {messages.map((m: UIMessage, i) => (
            <div key={m.id} className="space-y-2">
              {m.parts.map((part, j) => {
                const key = `${m.id}-${j}`;
                if (isToolUIPart(part)) {
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 text-xs text-kumo-subtle"
                    >
                      <WrenchIcon size={12} />
                      {getToolName(part)}
                      <Badge variant="secondary">
                        {part.state === "output-available" ? "done" : "running"}
                      </Badge>
                    </div>
                  );
                }
                if (part.type !== "text" || !part.text) return null;
                return m.role === "user" ? (
                  <div key={key} className="flex justify-end">
                    <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse">
                      {part.text}
                    </div>
                  </div>
                ) : (
                  <div key={key} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base ring ring-kumo-line">
                      <Streamdown
                        className="sd-theme p-3 text-sm"
                        plugins={{ code }}
                        controls={false}
                        isAnimating={streaming && i === messages.length - 1}
                      >
                        {part.text}
                      </Streamdown>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-end gap-2"
        >
          <InputArea
            value={input}
            onValueChange={setInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message ${agentName}…`}
            rows={1}
            disabled={streaming}
            aria-label="Message"
            className="flex-1 resize-none max-h-40"
          />
          {streaming ? (
            <Button
              type="button"
              variant="secondary"
              shape="square"
              aria-label="Stop"
              icon={<StopIcon size={16} />}
              onClick={stop}
            />
          ) : (
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send"
              disabled={!input.trim()}
              icon={<PaperPlaneRightIcon size={16} />}
            />
          )}
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              shape="square"
              aria-label="Clear chat"
              icon={<TrashIcon size={16} />}
              onClick={clearHistory}
            />
          )}
        </form>
      </div>
    </div>
  );
}
