// Checks that a run actually delivered its result where the objective asked
// (Notion, Google Doc, Slack, email). Llama sometimes says "Next, I will save
// it to Notion" and stops without calling the tool, so we check the calls.
import type { ToolCallRecord, ToolSlug } from "../shared";

export type Destination = {
  name: string;
  // Tool names that count as delivering to this destination.
  tools: RegExp;
};

const DESTINATIONS: {
  slug: ToolSlug;
  asked: RegExp;
  destination: Destination;
}[] = [
  {
    slug: "google_docs",
    asked: /google ?docs?\b|\bdoc\b/i,
    destination: { name: "Google Docs", tools: /^docs_(create|append)$/ }
  },
  {
    slug: "notion",
    asked: /notion/i,
    destination: { name: "Notion", tools: /^notion.*(create|update)/i }
  },
  {
    slug: "slack",
    asked: /slack|post\b.*#[\w-]+/i,
    destination: { name: "Slack", tools: /^slack_post_message$/ }
  },
  {
    slug: "gmail",
    asked:
      /\b(email|e-mail|mail)\s+(me|it|this|the|a|them)\b|\bsend\b.*\b(email|e-mail)\b/i,
    destination: { name: "email", tools: /^gmail_send$/ }
  }
];

// Destinations the objective asks for, limited to tools the agent has.
export function requiredDestinations(
  objective: string,
  granted: readonly ToolSlug[]
) {
  return DESTINATIONS.filter(
    (d) => granted.includes(d.slug) && d.asked.test(objective)
  ).map((d) => d.destination);
}

// Destinations with no successful tool call yet.
export function missingDestinations(
  required: Destination[],
  calls: ToolCallRecord[]
) {
  return required.filter(
    (d) => !calls.some((c) => c.ok && d.tools.test(c.tool))
  );
}
