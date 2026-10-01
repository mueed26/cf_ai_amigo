// Runs an agent once, step by step:
// load context -> do the task -> save new memories -> save the result.
// Cloudflare Workflows saves each step, so a retry won't redo finished steps.
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import { generateText, stepCountIs } from "ai";
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
import { buildTools } from "../lib/tools";
import { MODEL } from "../shared";

type RunParams = { runId: string };

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
      const { output, toolErrors } = await step.do(
        "execute",
        LLM_RETRY,
        async () => this.execute(ctx)
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
        console.warn(`Reflection failed for run ${runId}:`, error);
      }

      await step.do("save-result", async () => {
        await this.agent.finishRun(runId, { output, toolErrors });
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
  private async execute(ctx: RunContext) {
    const workersai = createWorkersAI({ binding: cleanAi(this.env.AI) });
    const previous = ctx.previousOutputs.length
      ? `\n\nYOUR PREVIOUS RESULTS (avoid repeating them unless still relevant):\n${ctx.previousOutputs
          .map((o, i) => `--- run -${i + 1} ---\n${o}`)
          .join("\n")}`
      : "";

    const result = await generateText({
      model: workersai(MODEL),
      system: agentSystemPrompt({ ...ctx, mode: "run" }),
      prompt: `Perform your objective now: ${ctx.config.objective}${previous}`,
      tools: await buildTools({
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
        requireApproval: false
      }),
      stopWhen: stepCountIs(10)
    });

    const text = result.text.trim();
    if (!text) throw new Error("The model returned an empty result.");

    // Tools return { error } instead of throwing, so collect those here.
    const toolErrors = result.steps.flatMap((s) =>
      s.toolResults
        .filter(
          (r) => r.output && typeof r.output === "object" && "error" in r.output
        )
        .map(
          (r) =>
            `${r.toolName}: ${String((r.output as { error: unknown }).error).slice(0, 200)}`
        )
    );
    return { output: text, toolErrors };
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
