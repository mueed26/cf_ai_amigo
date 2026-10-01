// Runs must actually save results where the objective asked.
import { describe, expect, it } from "vitest";
import { missingDestinations, requiredDestinations } from "@/lib/delivery";

const ok = (tool: string) => ({ tool, ok: true, ms: 10 });

describe("requiredDestinations", () => {
  it("finds destinations named in the objective", () => {
    const required = requiredDestinations(
      "Find this week's AI news, save it to a new Notion page and post the link to #agent-reports on Slack.",
      ["web_search", "notion", "slack"]
    );
    expect(required.map((d) => d.name)).toEqual(["Notion", "Slack"]);
  });

  it("only counts tools the agent has", () => {
    expect(requiredDestinations("Save it to Notion", ["web_search"])).toEqual(
      []
    );
  });

  it("needs gmail_send only when asked to email", () => {
    expect(
      requiredDestinations("Email me the summary", ["gmail"]).map((d) => d.name)
    ).toEqual(["email"]);
    expect(
      requiredDestinations("Summarize my unread Gmail", ["gmail"])
    ).toEqual([]);
  });
});

describe("missingDestinations", () => {
  const required = requiredDestinations("Save it to Notion and a Google Doc", [
    "notion",
    "google_docs"
  ]);

  it("reports destinations with no successful call", () => {
    // The real failure: web search only, then "Next, I will create a Notion page".
    expect(
      missingDestinations(required, [ok("web_search")]).map((d) => d.name)
    ).toEqual(["Google Docs", "Notion"]);
  });

  it("is satisfied by successful saves only", () => {
    const calls = [
      ok("notion_create_pages"),
      { tool: "docs_create", ok: false, ms: 5 }
    ];
    expect(missingDestinations(required, calls).map((d) => d.name)).toEqual([
      "Google Docs"
    ]);
    expect(
      missingDestinations(required, [...calls, ok("docs_create")])
    ).toEqual([]);
  });
});
