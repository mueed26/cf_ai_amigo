// The planner reads Llama's streamed JSON and turns it into an agent config.
import { describe, expect, it } from "vitest";
import { planAgent } from "@/lib/planner";

// Fake Workers AI binding that streams the given JSON a few characters at a time,
// with each piece in both fields like the real API.
function fakeAi(json: unknown) {
  const text = JSON.stringify(json);
  const pieces = text.match(/.{1,7}/gs) ?? [];
  const sse =
    pieces
      .map(
        (p) =>
          `data: ${JSON.stringify({ response: p, choices: [{ delta: { content: p } }] })}\n`
      )
      .join("") + "data: [DONE]\n";
  return {
    run: async () => new Response(sse).body
  } as unknown as Ai;
}

const input = {
  prompt: "Summarize AI news daily",
  timezone: "Asia/Kolkata",
  connected: []
};

const readyConfig = {
  name: "AI News",
  description: "Daily AI news.",
  instructions: "Find and summarize AI news.",
  objective: "Summarize today's AI news and save it to a new Google Doc.",
  skills: ["Research", "Summaries", "News", "Docs", "Writing", "Extra"],
  tools: ["web_search", "google_docs", "made_up_tool", "web_search"],
  schedule: { type: "recurring", label: "Daily at 09:00", cron: "0 9 * * *" },
  outputFormat: "Markdown"
};

describe("planAgent", () => {
  it("returns a cleaned-up config and streams the text", async () => {
    let streamed = "";
    const result = await planAgent(
      fakeAi({ status: "ready", questions: [], config: readyConfig }),
      input,
      (delta) => (streamed += delta)
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    // Invented tools are dropped and duplicates removed.
    expect(result.config.tools).toEqual(["web_search", "google_docs"]);
    // At most 5 skills.
    expect(result.config.skills).toHaveLength(5);
    expect(result.config.schedule.cron).toBe("0 9 * * *");
    expect(result.config.image).toContain("dicebear");
    // Text was streamed once, not twice.
    expect(JSON.parse(streamed).config.name).toBe("AI News");
  });

  it("returns clarifying questions when details are missing", async () => {
    const result = await planAgent(
      fakeAi({
        status: "needs_clarification",
        questions: [
          {
            id: "channel",
            question: "Which Slack channel?",
            type: "single_select",
            options: ["#general"],
            allowCustom: true
          }
        ]
      }),
      input
    );
    expect(result).toEqual({
      status: "needs_clarification",
      questions: [
        {
          id: "channel",
          question: "Which Slack channel?",
          type: "single_select",
          options: ["#general"],
          allowCustom: true
        }
      ]
    });
  });

  it("fails clearly when the model returns nothing useful", async () => {
    await expect(
      planAgent(fakeAi({ status: "needs_clarification", questions: [] }), input)
    ).rejects.toThrow("neither questions nor a config");
  });
});
