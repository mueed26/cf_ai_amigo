/**
 * Runtime tools for Amigo agents. Everything runs inside the Worker using
 * `fetch` — no third-party API keys required.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Memory, ToolSlug } from "../shared";

const MAX_PAGE_CHARS = 8_000;
const USER_AGENT =
  "cf-ai-amigo/1.0 (+https://developers.cloudflare.com/agents/)";

/** Sync inside the Durable Object, async (RPC) from inside a Workflow. */
export type MemoryStore = {
  remember(content: string, source: Memory["source"]): Memory | Promise<Memory>;
  recall(): Memory[] | Promise<Memory[]>;
};

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function webSearch(query: string) {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT
    },
    body: new URLSearchParams({ q: query }).toString()
  });
  if (!res.ok) throw new Error(`Search failed with HTTP ${res.status}`);
  const html = await res.text();

  const results: { title: string; url: string; snippet: string }[] = [];
  const blocks = html.split(/class="result results_links/).slice(1);
  for (const block of blocks) {
    const link = block.match(
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
    );
    if (!link) continue;
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    let url = link[1].replace(/&amp;/g, "&");
    // DuckDuckGo wraps results in a redirect: //duckduckgo.com/l/?uddg=<encoded>
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    results.push({
      title: htmlToText(link[2]),
      url,
      snippet: snippet ? htmlToText(snippet[1]) : ""
    });
    if (results.length >= 8) break;
  }
  return results;
}

async function webFetch(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http(s) URLs can be fetched.");
  }
  const res = await fetch(parsed, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/json,text/plain"
    },
    redirect: "follow"
  });
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  const text = type.includes("html") ? htmlToText(body) : body;
  return {
    url: res.url,
    status: res.status,
    contentType: type,
    content: text.slice(0, MAX_PAGE_CHARS),
    truncated: text.length > MAX_PAGE_CHARS
  };
}

/** Build the tool set for one agent: its granted catalog tools + memory. */
export function buildTools({
  granted,
  timezone,
  memory,
  memorySource
}: {
  granted: ToolSlug[];
  timezone: string;
  memory: MemoryStore;
  memorySource: Memory["source"];
}): ToolSet {
  const all = {
    web_search: tool({
      description:
        "Search the public web. Returns titles, URLs and snippets. Follow up with web_fetch to read a page.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Search query")
      }),
      execute: async ({ query }) => {
        try {
          const results = await webSearch(query);
          return results.length
            ? results
            : "No results found. Try a different query.";
        } catch (e) {
          return { error: String(e) };
        }
      }
    }),
    web_fetch: tool({
      description:
        "Fetch a public web page or JSON API and return its readable text.",
      inputSchema: z.object({
        url: z.string().url().describe("Absolute http(s) URL")
      }),
      execute: async ({ url }) => {
        try {
          return await webFetch(url);
        } catch (e) {
          return { error: String(e) };
        }
      }
    }),
    current_time: tool({
      description: "Get the current date and time in the user's timezone.",
      inputSchema: z.object({}),
      execute: async () => ({
        timezone,
        localTime: new Date().toLocaleString("en-US", {
          timeZone: timezone,
          dateStyle: "full",
          timeStyle: "long"
        }),
        iso: new Date().toISOString()
      })
    })
  } satisfies Record<ToolSlug, unknown>;

  const tools: ToolSet = {
    remember: tool({
      description:
        "Save a durable fact to your long-term memory (user preferences, things already reported, important results). Keep each memory short.",
      inputSchema: z.object({ content: z.string().min(3).max(500) }),
      execute: async ({ content }) => memory.remember(content, memorySource)
    }),
    recall: tool({
      description: "List everything in your long-term memory.",
      inputSchema: z.object({}),
      execute: async () => memory.recall()
    })
  };
  for (const slug of granted) tools[slug] = all[slug];
  return tools;
}
