// Slide-over chat with one agent. Replies stream in live, tools show as they
// run, and sending/creating anything waits for the user's approval.
import { useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Check,
  Loader2,
  ShieldQuestion,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X
} from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { AmigoAgent } from "@/agents/amigo-agent";
import { useAuthQuery } from "@/lib/use-auth-query";
import { agentImage } from "@/lib/format";
import type { AgentSummary, AmigoAgentState } from "@/shared";
import { ConnectPrompt } from "./shared";

const SUGGESTIONS = [
  "Do your task now",
  "What do you remember?",
  "Remember that I prefer short bullet points"
];

export default function AgentChatDrawer({
  agent,
  onClose
}: {
  agent: AgentSummary | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        {agent && <ChatBody key={agent.id} agent={agent} />}
      </SheetContent>
    </Sheet>
  );
}

function ChatBody({ agent }: { agent: AgentSummary }) {
  const [prompt, setPrompt] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const authQuery = useAuthQuery();
  const connection = useAgent<AmigoAgent, AmigoAgentState>({
    agent: "AmigoAgent",
    name: agent.id,
    ...authQuery
  });
  const {
    messages,
    sendMessage,
    clearHistory,
    stop,
    status,
    addToolApprovalResponse
  } = useAgentChat({
    agent: connection,
    experimental_throttle: 80
  });
  const busy = status === "streaming" || status === "submitted";
  const image = agentImage(agent.image, agent.name);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function send(text = prompt) {
    const message = text.trim();
    if (!message || busy) return;
    setPrompt("");
    sendMessage({ role: "user", parts: [{ type: "text", text: message }] });
  }

  const lastIsUser = messages.at(-1)?.role === "user";

  return (
    <>
      <SheetHeader className="border-b px-5 py-4 pr-14">
        <div className="flex items-center gap-3">
          <img
            src={image}
            alt={agent.name}
            className="size-11 rounded-xl bg-slate-100 object-cover p-1"
          />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base">{agent.name}</SheetTitle>
            <SheetDescription className="text-xs">
              Ask questions, get answers in chat, or have it run its task.
            </SheetDescription>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear chat"
              onClick={clearHistory}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
        <div className="flex min-h-full flex-col justify-end gap-4">
          <div className="mx-auto mb-2 max-w-sm text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Sparkles className="size-5" />
            </div>
            <h2 className="text-sm font-medium">
              Start a chat with {agent.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {agent.objective || agent.description}
            </p>
          </div>

          <ConnectPrompt tools={agent.tools} />

          <AgentBubble image={image} name={agent.name}>
            Hi! I'm {agent.name}. What would you like me to work on?
          </AgentBubble>

          {messages.map((message: UIMessage) =>
            message.parts.map((part, i) => {
              const key = `${message.id}-${i}`;
              if (isToolUIPart(part)) {
                if (part.state === "approval-requested") {
                  return (
                    <ApprovalCard
                      key={key}
                      toolName={getToolName(part)}
                      input={part.input}
                      onRespond={(approved) =>
                        addToolApprovalResponse({
                          id: part.approval.id,
                          approved
                        })
                      }
                    />
                  );
                }
                return (
                  <ToolLine
                    key={key}
                    name={getToolName(part)}
                    state={part.state}
                  />
                );
              }
              if (part.type !== "text" || !part.text) return null;
              return message.role === "user" ? (
                <div key={key} className="flex justify-end">
                  <Bubble align="end" variant="default">
                    <BubbleContent>
                      <p className="whitespace-pre-wrap break-words">
                        {part.text}
                      </p>
                    </BubbleContent>
                  </Bubble>
                </div>
              ) : (
                <AgentBubble key={key} image={image} name={agent.name}>
                  <Markdown text={part.text} />
                </AgentBubble>
              );
            })
          )}

          {busy && lastIsUser && (
            <AgentBubble image={image} name={agent.name}>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {agent.name} is
                thinking…
              </span>
            </AgentBubble>
          )}

          {messages.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t bg-background p-4">
        <div className="rounded-2xl border p-2 shadow-sm focus-within:border-brand">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              busy ? `${agent.name} is replying…` : `Message ${agent.name}…`
            }
            aria-label="Message your agent"
            className="max-h-40 min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-end pt-1">
            {busy ? (
              <Button
                size="icon"
                variant="outline"
                className="rounded-full"
                onClick={stop}
                aria-label="Stop"
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => send()}
                disabled={!prompt.trim()}
                className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                aria-label="Send message"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AgentBubble({
  image,
  name,
  children
}: {
  image: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-2">
      <img
        src={image}
        alt={name}
        className="size-8 rounded-full border bg-background object-cover p-1"
      />
      <Bubble align="start" variant="outline">
        <BubbleContent>{children}</BubbleContent>
      </Bubble>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_table]:w-full [&_td]:border [&_td]:p-1 [&_th]:border [&_th]:p-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function ToolLine({ name, state }: { name: string; state: string }) {
  const done = state === "output-available";
  const failed = state === "output-error" || state === "output-denied";
  return (
    <div className="ml-10 flex items-center gap-2 text-xs text-muted-foreground">
      <Wrench className="size-3" />
      <span className="font-mono">{name}</span>
      {done && <Check className="size-3 text-green-600" />}
      {failed && <X className="size-3 text-red-600" />}
      {!done && !failed && <Loader2 className="size-3 animate-spin" />}
    </div>
  );
}

function ApprovalCard({
  toolName,
  input,
  onRespond
}: {
  toolName: string;
  input: unknown;
  onRespond: (approved: boolean) => void;
}) {
  return (
    <div className="ml-10 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <ShieldQuestion className="size-4" /> Allow {toolName}?
      </p>
      <pre className="max-h-48 overflow-auto rounded-lg bg-white p-2 text-xs whitespace-pre-wrap">
        {JSON.stringify(input, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onRespond(true)}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onRespond(false)}>
          Deny
        </Button>
      </div>
    </div>
  );
}
