// Rescuing tool calls that Llama wrote as text instead of calling the tool.
import { describe, expect, it } from "vitest";
import { findTextToolCall, parseJsonStrings } from "@/lib/salvage";

// Shaped like the real failed run: the call written out twice, with "pages"
// sent as a string instead of a list.
const pages = JSON.stringify([
  {
    properties: { title: "Cloudflare AI news" },
    content:
      "## This week\n* [AI Search GA](https://blog.cloudflare.com/ai-search-ga)"
  }
]);
const call = JSON.stringify({
  type: "function",
  name: "notion_create_pages",
  parameters: { pages }
});

describe("findTextToolCall", () => {
  it("rescues a tool call written as text, even when repeated", () => {
    expect(findTextToolCall(`${call}\n\n${call}`)).toMatchObject({
      name: "notion_create_pages",
      args: {
        pages: [
          {
            properties: { title: "Cloudflare AI news" },
            content:
              "## This week\n* [AI Search GA](https://blog.cloudflare.com/ai-search-ga)"
          }
        ]
      }
    });
  });

  it("accepts 'arguments' as well as 'parameters'", () => {
    expect(
      findTextToolCall(
        '{"name":"slack_post_message","arguments":{"channel":"#a","text":"hi"}}'
      )
    ).toMatchObject({
      name: "slack_post_message",
      args: { channel: "#a", text: "hi" }
    });
  });

  it("ignores normal answers and broken JSON", () => {
    expect(
      findTextToolCall("Here are this week's top stories: ...")
    ).toBeNull();
    expect(
      findTextToolCall(
        '{"type": "function", "name": "notion_create_pages", "parameters": {"pages": "[{'
      )
    ).toBeNull();
    expect(findTextToolCall('{"title": "not a tool call"}')).toBeNull();
  });
});

describe("parseJsonStrings", () => {
  it("turns lists and objects sent as strings into real data", () => {
    expect(
      parseJsonStrings({ pages: '[{"a":1}]', note: "[not json", n: 2 })
    ).toEqual({
      pages: [{ a: 1 }],
      note: "[not json",
      n: 2
    });
  });
});
