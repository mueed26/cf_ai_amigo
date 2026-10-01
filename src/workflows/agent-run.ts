// Runs an agent once, step by step:
// load context -> do the task -> save new memories -> save the result.
// Cloudflare Workflows saves each step, so a retry won't redo finished steps.
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import { generateText, stepCountIs, type ToolSet } from "ai";
import type { BrowserWorker } from "@cloudflare/puppeteer";
import { createWorkersAI } from "workers-ai-provider";
import { cleanAi } from "../lib/ai";
import { z } from "zod";
import {
  agentSystemPrompt,
  workspaceTools,
  type AmigoAgent,
  type RunContext
} from "../agents/amigo-agent";
import { secrets } from "../lib/integrations/secrets";
import { missingDestinations, requiredDestinations } from "../lib/delivery";
import { log } from "../lib/log";
import { findTextToolCall } from "../lib/salvage";
import { buildTools } from "../lib/tools";
import { MODEL, type ToolCallRecord } from "../shared";

type RunParams = { runId: string };

// Long enough for a full report or a tool call with a lot of content.
const MAX_OUTPUT_TOKENS = 2048;

const LLM_RETRY = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes"
} as const;

export class AgentRunWorkflow extends AgentWorkflow<AmigoAgent, RunParams> {
  async run(event: AgentWorkflowEvent<RunParams>, step: AgentWorkflowStep) {
    const { runId } = event.payload;

    try {
      await this.reportProgress({ step: "loading context" });
      // Store as a JSON string so the step can be saved.
      const ctx: RunContext = JSON.parse(
        await step.do("load-context", async () =>
          JSON.stringify(await this.agent.getRunContext())
        )
      );

      await this.reportProgress({ step: "working" });
      const { output, toolCalls } = await step.do(
        "execute",
        LLM_RETRY,
        async () => this.execute(ctx, runId)
      );

      await this.reportProgress({ step: "updating memory" });
      try {
        await step.do("reflect", LLM_RETRY, async () => {
          const facts = await this.reflect(ctx, output);
          for (const fact of facts) await this.agent.addMemory(fact, "run");
          return facts;
        });
      } catch (error) {
        // Saving memories is optional; don't fail the run over it.
        log("reflection_failed", { runId, error: String(error) });
      }

      await step.do("save-result", async () => {
        await this.agent.finishRun(runId, { output, toolCalls });
      });
      return { output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await step.do("save-failure", async () => {
        await this.agent.finishRun(runId, { error: message });
      });
      return { error: message };
    }
  }

  // Do the task with Llama 3.3 and the agent's tools (max 10 steps).
  private async execute(ctx: RunContext, runId: string) {
    const workersai = createWorkersAI({ binding: cleanAi(this.env.AI) });
    // Every tool call in this run, with timings, for the run's "Steps".
    const toolCalls: ToolCallRecord[] = [];
    const previous = ctx.previousOutputs.length
      ? `\n\nYOUR PREVIOUS RESULTS (avoid repeating them unless still relevant):\n${ctx.previousOutputs
          .map((o, i) => `--- run -${i + 1} ---\n${o}`)
          .join("\n")}`
      : "";

    const model = workersai(MODEL);
    const system = agentSystemPrompt({ ...ctx, mode: "run" });
    const prompt = `Perform your objective now: ${ctx.config.objective}${previous}`;
    const tools = await buildTools({
      granted: ctx.config.tools,
      timezone: ctx.timezone,
      memory: {
        remember: (content, source) => this.agent.addMemory(content, source),
        recall: () => ctx.memories
      },
      memorySource: "run",
      workspace: workspaceTools(this.env, ctx.workspaceId),
      browser: this.env.BROWSER as unknown as BrowserWorker,
      // No one is watching scheduled runs, so don't wait for approval.
      requireApproval: false,
      trace: { runId, agent: ctx.config.name },
      calls: toolCalls,
      searchApiKey: secrets(this.env).TAVILY_API_KEY
    });

    const result = await generateText({
      model,
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(10),
      // Without this, Workers AI uses a short default and long tool calls get cut off.
      maxOutputTokens: MAX_OUTPUT_TOKENS
    });
    let text = await runTextToolCall(result.text.trim(), tools, toolCalls);

    // If the objective asked to save or send the result somewhere and the
    // agent stopped before doing it, remind it once.
    const required = requiredDestinations(
      ctx.config.objective,
      ctx.config.tools
    );
    let missing = missingDestinations(required, toolCalls);
    if (missing.length) {
      const names = missing.map((d) => d.name).join(" and ");
      const retry = await generateText({
        model,
        system,
        tools,
        messages: [
          { role: "user", content: prompt },
          ...result.response.messages,
          {
            role: "user",
            content: `You haven't finished yet: you still need to save or send the result to ${names}. Call the tool for that now, then reply with where it was saved and the link.`
          }
        ],
        stopWhen: stepCountIs(4),
        maxOutputTokens: MAX_OUTPUT_TOKENS
      });
      const retryText = await runTextToolCall(
        retry.text.trim(),
        tools,
        toolCalls
      );
      if (retryText) text = text ? `${text}\n\n${retryText}` : retryText;
      missing = missingDestinations(required, toolCalls);
    }
    // Still not delivered: show it in the run's steps so it isn't "completed".
    for (const d of missing) {
      toolCalls.push({
        tool: `${d.name} (not saved)`,
        ok: false,
        ms: 0,
        error: `The agent didn't save the result to ${d.name}.`
      });
    }

    if (!text) throw new Error("The model returned an empty result.");
    return { output: text, toolCalls };
  }

  // Ask the AI which new facts from this run are worth remembering.
  private async reflect(ctx: RunContext, output: string): Promise<string[]> {
    const response = (await this.env.AI.run(
      MODEL as keyof AiModels,
      {
        messages: [
          {
            role: "system",
            content:
              'You maintain the long-term memory of an AI agent. Given the agent objective, its existing memories and the output of its latest run, return JSON {"facts": string[]} with 0-3 NEW short facts worth remembering for future runs (e.g. items already reported, user preferences, trends). Never repeat existing memories. Return an empty array if nothing is worth keeping.'
          },
          {
            role: "user",
            content: `OBJECTIVE: ${ctx.config.objective}\n\nEXISTING MEMORIES:\n${
              ctx.memories.map((m) => `- ${m.content}`).join("\n") || "(none)"
            }\n\nLATEST OUTPUT:\n${output.slice(0, 6000)}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: { facts: { type: "array", items: { type: "string" } } },
            required: ["facts"]
          }
        },
        max_tokens: 512
      } as never
    )) as { response?: unknown };

    const raw =
      typeof response.response === "string"
        ? JSON.parse(response.response)
        : response.response;
    const { facts } = z
      .object({ facts: z.array(z.string()).catch([]) })
      .parse(raw ?? {});
    return facts
      .map((f) => f.trim())
      .filter((f) => f.length > 2)
      .slice(0, 3);
  }
}

// If the model wrote a tool call as text instead of calling the tool, run that
// tool ourselves (it's still traced and recorded) and report what happened.
async function runTextToolCall(
  text: string,
  tools: ToolSet,
  calls: ToolCallRecord[]
) {
  const call = findTextToolCall(text);
  if (!call) return text;
  // Already done for real in this run: just drop the leftover JSON
  // instead of running it again (that would create duplicates).
  if (calls.some((c) => c.ok && c.tool === call.name)) {
    return (
      text.split(call.raw).join("").trim() || `Done: ${call.name} finished.`
    );
  }
  const tool = tools[call.name] as
    | { execute?: (input: unknown, options: unknown) => Promise<unknown> }
    | undefined;
  if (!tool?.execute) return text;
  const result = await tool.execute(call.args, {
    toolCallId: `text-${call.name}`,
    messages: []
  });
  const failed = !!result && typeof result === "object" && "error" in result;
  const details = typeof result === "string" ? result : JSON.stringify(result);
  return failed
    ? `Tried ${call.name}, but it failed: ${details.slice(0, 500)}`
    : `Done: ${call.name} finished.\n\n${details.slice(0, 1500)}`;
}
