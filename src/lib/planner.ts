// Turns a plain-English request into an agent config using Llama 3.3.
// If something important is missing, it asks questions instead.
import { z } from "zod";
import {
  MODEL,
  TOOL_CATALOG,
  type ConnectionId,
  type PlanResult,
  type ToolSlug
} from "../shared";

const toolSlugs: string[] = TOOL_CATALOG.map((t) => t.slug);
const isToolSlug = (t: string): t is ToolSlug => toolSlugs.includes(t);

const planSchema = z.object({
  status: z.enum(["needs_clarification", "ready"]),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        type: z.enum(["single_select", "multi_select", "text"]).catch("text"),
        options: z.array(z.string()).catch([]),
        allowCustom: z.boolean().catch(true)
      })
    )
    .catch([]),
  config: z
    .object({
      name: z.string().min(1),
      description: z.string(),
      instructions: z.string().min(1),
      objective: z.string().min(1),
      skills: z.array(z.string()).catch([]),
      tools: z.array(z.string()).catch([]),
      schedule: z.object({
        type: z.enum(["manual", "once", "recurring"]).catch("manual"),
        label: z.string().catch("Manual"),
        cron: z.string().optional().nullable(),
        runAt: z.string().optional().nullable()
      }),
      outputFormat: z.string().catch("Concise Markdown.")
    })
    .optional()
    .nullable()
});

// The JSON shape we ask Llama to return.
const jsonSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["needs_clarification", "ready"] },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          type: {
            type: "string",
            enum: ["single_select", "multi_select", "text"]
          },
          options: { type: "array", items: { type: "string" } },
          allowCustom: { type: "boolean" }
        },
        required: ["id", "question", "type", "options", "allowCustom"]
      }
    },
    config: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        instructions: { type: "string" },
        objective: { type: "string" },
        skills: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "string", enum: toolSlugs } },
        schedule: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["manual", "once", "recurring"] },
            label: { type: "string" },
            cron: { type: "string" },
            runAt: { type: "string" }
          },
          required: ["type", "label"]
        },
        outputFormat: { type: "string" }
      },
      required: [
        "name",
        "description",
        "instructions",
        "objective",
        "skills",
        "tools",
        "schedule",
        "outputFormat"
      ]
    }
  },
  required: ["status", "questions"]
};

function systemPrompt(
  now: string,
  timezone: string,
  connected: ConnectionId[]
) {
  const tools = TOOL_CATALOG.map((t) => {
    const status = !t.connection
      ? "built-in"
      : connected.includes(t.connection)
        ? "connected"
        : "not connected yet (the user can connect it after creating the agent)";
    return `- ${t.slug}: ${t.description} [${status}]`;
  }).join("\n");
  return `You are AMIGO, an AI Agent Configuration Architect running on Cloudflare.
Decide whether the user's request has enough information to create an executable AI agent, and respond ONLY with JSON matching the schema.

The user's current local time is ${now} (timezone ${timezone}).

RESPONSE RULES
- If information that BLOCKS execution is missing: status="needs_clarification", ask at most 3 short questions, omit config.
- Otherwise: status="ready", questions=[], and produce the full config.
- Never ask about optional preferences when a sensible default exists.
- If the user already answered clarifying questions (see ANSWERS), do not ask them again — produce the config.

DEFAULTS
- No schedule mentioned -> schedule.type="manual", label="Manual".
- Results are shown inside the app unless the user says otherwise.

SCHEDULE
- Scheduling is handled by AMIGO, not by the agent. Put timing ONLY in config.schedule.
- recurring -> schedule.cron is a 5-field cron in the USER'S LOCAL time (minute hour day-of-month month day-of-week, 0=Sunday). Example: "every weekday at 9am" -> "0 9 * * 1-5". label is human readable, e.g. "Weekdays at 09:00".
- once -> schedule.runAt is a local datetime "YYYY-MM-DDTHH:mm" in the future.
- config.objective describes only the task performed on each run (no timing words).
- config.objective MUST include where the result goes when the user names a destination, e.g. "Find the top 5 AI stories on Hacker News this week, summarize each in one line, and save them to a new Google Doc." Never drop the destination.
- Keep time windows from the request in the objective (e.g. "this week" -> "from the past 7 days").
- config.instructions tell the agent to perform the task once per run and never to schedule anything itself.

TOOLS (config.tools must only contain these slugs)
${tools}
- Choose web_search when the task needs current information from the internet (it includes reading web pages).
- Choose gmail to read/search/send email, google_docs to save reports to a doc, notion to read/write Notion, hacker_news for Hacker News research, slack to read or post Slack messages.
- Select an integration whenever the task needs it, even if it is not connected yet.
- Agents also always have long-term memory (remember/recall) — do not list it in tools.
- If the request needs an app that is not listed, still build the agent but have it produce the content in the app, and mention that in the description.
- When the result must be delivered somewhere (email, Slack channel, Notion page, Google Doc), say exactly where in config.instructions; ask a clarifying question if the destination (e.g. Slack channel name) is missing.

STYLE
- name: short and catchy (2-4 words). description: one sentence.
- skills: 2-5 items, 2-3 words each, Title Case.
- instructions: a detailed system prompt (role, steps, which tools to use when, quality bar, cite sources as links).
- outputFormat: how to format the final answer (concise Markdown unless the user wants something else).
- Clarifying question options: 2-5 short options; allowCustom=true when the user may want another value.`;
}

export async function planAgent(
  ai: Ai,
  input: {
    prompt: string;
    answers?: Record<string, string | string[]>;
    timezone: string;
    connected: ConnectionId[];
  },
  // Called with each new piece of text so the UI can show it live.
  onText?: (delta: string) => void
): Promise<PlanResult> {
  const now = new Date().toLocaleString("en-US", {
    timeZone: input.timezone,
    dateStyle: "full",
    timeStyle: "short"
  });

  const answers =
    input.answers && Object.keys(input.answers).length > 0
      ? `\n\nANSWERS TO YOUR CLARIFYING QUESTIONS:\n${Object.entries(
          input.answers
        )
          .map(([q, a]) => `- ${q}: ${Array.isArray(a) ? a.join(", ") : a}`)
          .join("\n")}`
      : "";

  const stream = (await ai.run(
    MODEL as keyof AiModels,
    {
      messages: [
        {
          role: "system",
          content: systemPrompt(now, input.timezone, input.connected)
        },
        { role: "user", content: `USER REQUEST:\n${input.prompt}${answers}` }
      ],
      response_format: { type: "json_schema", json_schema: jsonSchema },
      max_tokens: 2048,
      temperature: 0.3,
      stream: true
    } as never
  )) as ReadableStream<Uint8Array>;

  const text = await readStreamedText(stream, onText);
  const parsed = planSchema.parse(JSON.parse(extractJson(text)));

  if (parsed.status === "ready" && parsed.config) {
    const c = parsed.config;
    return {
      status: "ready",
      config: {
        ...c,
        image: `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(c.name)}`,
        skills: c.skills.slice(0, 5),
        // Ignore tools that don't exist.
        tools: [...new Set(c.tools.filter(isToolSlug))],
        schedule: {
          type: c.schedule.type,
          label: c.schedule.label,
          cron: c.schedule.cron ?? undefined,
          runAt: c.schedule.runAt ?? undefined
        }
      }
    };
  }

  if (parsed.questions.length === 0) {
    throw new Error("The planner returned neither questions nor a config.");
  }
  return {
    status: "needs_clarification",
    questions: parsed.questions.slice(0, 3)
  };
}

// Read a Workers AI text stream (server-sent events) and return the full text.
async function readStreamedText(
  stream: ReadableStream<Uint8Array>,
  onText?: (delta: string) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as {
          response?: string;
          choices?: { delta?: { content?: string } }[];
        };
        // Each chunk has the text in two places; use only one.
        const delta =
          chunk.choices?.[0]?.delta?.content ?? chunk.response ?? "";
        if (delta) {
          text += delta;
          onText?.(delta);
        }
      } catch {
        // ignore partial or non-JSON lines
      }
    }
  }
  return text;
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
