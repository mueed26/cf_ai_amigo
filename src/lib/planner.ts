/**
 * Prompt-to-agent planner: Llama 3.3 on Workers AI turns a plain-English job
 * description into either clarifying questions or a complete agent config.
 * Ported from AMIGO AI's Gemini planner, using Workers AI JSON mode.
 */
import { z } from "zod";
import { MODEL, TOOL_CATALOG, type PlanResult, type ToolSlug } from "../shared";

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

// JSON schema handed to Workers AI JSON mode (kept flat; mirrors planSchema).
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

function systemPrompt(now: string, timezone: string) {
  const tools = TOOL_CATALOG.map((t) => `- ${t.slug}: ${t.description}`).join(
    "\n"
  );
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
- config.instructions tell the agent to perform the task once per run and never to schedule anything itself.

TOOLS (config.tools must only contain these slugs)
${tools}
- Choose web_search + web_fetch when the task needs current information from the internet.
- Agents also always have long-term memory (remember/recall) — do not list it in tools.
- If the request needs an integration that is not listed (e.g. sending email or Slack), still build the agent but have it produce the content in the app, and mention that in the description.

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
  }
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

  const response = (await ai.run(
    MODEL as keyof AiModels,
    {
      messages: [
        { role: "system", content: systemPrompt(now, input.timezone) },
        { role: "user", content: `USER REQUEST:\n${input.prompt}${answers}` }
      ],
      response_format: { type: "json_schema", json_schema: jsonSchema },
      max_tokens: 2048,
      temperature: 0.3
    } as never
  )) as { response?: unknown };

  const raw =
    typeof response.response === "string"
      ? JSON.parse(extractJson(response.response))
      : response.response;

  const parsed = planSchema.parse(raw);

  if (parsed.status === "ready" && parsed.config) {
    const c = parsed.config;
    return {
      status: "ready",
      config: {
        ...c,
        skills: c.skills.slice(0, 5),
        // Drop anything the model invented outside the catalog.
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

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
