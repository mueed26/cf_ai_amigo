// Builds the list of tools an agent can use: web, memory, Hacker News and apps.
import { jsonSchema, tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  TOOL_CATALOG,
  type Memory,
  type ToolCallRecord,
  type ToolSlug
} from "../shared";
import { INTEGRATION_TOOLS } from "./integrations";
import type { BrowserWorker } from "@cloudflare/puppeteer";
import { renderPageText } from "./browser";
import { hackerNewsTools } from "./hackernews";
import { log } from "./log";
import { htmlToText } from "./text";

const MAX_PAGE_CHARS = 8_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; cf-ai-amigo/1.0; +https://developers.cloudflare.com/agents/)";

// Where the agent saves and reads memories.
export type MemoryStore = {
  remember(content: string, source: Memory["source"]): Memory | Promise<Memory>;
  recall(): Memory[] | Promise<Memory[]>;
};

// What an agent needs from the Workspace to use app tools.
export type WorkspaceTools = {
  callTool(name: string, args: unknown): Promise<unknown>;
  notionTools(): Promise<
    { name: string; description: string; inputSchema: unknown }[]
  >;
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  published?: string;
};

export function parseDuckDuckGo(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // Works with both DuckDuckGo page formats (html and lite).
  const linkRe =
    /<a[^>]+class=['"](?:result__a|result-link)['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>|<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"](?:result__a|result-link)['"][^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe =
    /class=['"](?:result__snippet|result-snippet)['"][^>]*>([\s\S]*?)<\/(?:a|td)>/g;
  const snippets = [...html.matchAll(snippetRe)].map((m) => htmlToText(m[1]));
  let i = 0;
  for (const m of html.matchAll(linkRe)) {
    let url = (m[1] ?? m[3]).replace(/&amp;/g, "&");
    const uddg = url.match(/[?&]uddg=([^&]+)/); // DDG redirect wrapper
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (!url.startsWith("http") || url.includes("duckduckgo.com/y.js"))
      continue; // skip ads
    results.push({
      title: htmlToText(m[2] ?? m[4]),
      url,
      snippet: snippets[i++] ?? ""
    });
    if (results.length >= 8) break;
  }
  return results;
}

type Recent = "day" | "week" | "month";

// Tavily: a search API made for AI agents (free tier, no card).
async function tavilySearch(query: string, apiKey: string, recent?: Recent) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      max_results: 8,
      topic: recent ? "news" : "general",
      ...(recent ? { time_range: recent } : {})
    })
  });
  if (!res.ok) throw new Error(`Tavily returned HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: {
      title: string;
      url: string;
      content?: string;
      published_date?: string;
    }[];
  };
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content ?? "").slice(0, 300),
    ...(r.published_date ? { published: r.published_date } : {})
  }));
}

// DuckDuckGo's HTML pages. Works from most networks, but often blocks
// requests from data centres (including Cloudflare's).
async function duckDuckGoSearch(query: string) {
  for (const endpoint of [
    "https://html.duckduckgo.com/html/",
    "https://lite.duckduckgo.com/lite/"
  ]) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": USER_AGENT
        },
        body: new URLSearchParams({ q: query }).toString()
      });
      if (!res.ok) continue;
      const results = parseDuckDuckGo(await res.text());
      if (results.length) return results;
    } catch {
      // try the next endpoint
    }
  }
  return [];
}

// Wikipedia's official search API: good for background on a topic, not for news.
async function wikipediaSearch(query: string) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
    format: "json"
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "user-agent": USER_AGENT }
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet: string }[] };
  };
  return (data.query?.search ?? []).map((r) => ({
    title: `${r.title} (Wikipedia)`,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    snippet: htmlToText(r.snippet)
  }));
}

// Try each search source in turn and return the first one with results.
export async function webSearch(
  query: string,
  options: { apiKey?: string; recent?: Recent } = {}
): Promise<SearchResult[]> {
  if (options.apiKey) {
    try {
      const results = await tavilySearch(query, options.apiKey, options.recent);
      if (results.length) return results;
    } catch {
      // fall back to the free sources below
    }
  }
  const ddg = await duckDuckGoSearch(query);
  if (ddg.length) return ddg;
  const wiki = await wikipediaSearch(query);
  if (wiki.length) return wiki;
  throw new Error(
    "Web search is unavailable right now. Use hacker_news for tech news, or web_fetch on a known site (e.g. blog.cloudflare.com)."
  );
}

// Less text than this usually means the page needs JavaScript.
const MIN_STATIC_TEXT = 600;
const BLOCKED_STATUSES = new Set([401, 403, 429, 503]);

// Try a normal fetch first. If the page is empty or blocked, use Browser Run.
export async function webFetch(url: string, browser?: BrowserWorker) {
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
  const isHtml = type.includes("html");
  const text = isHtml ? htmlToText(body) : body;
  const result = {
    url: res.url,
    status: res.status,
    renderedWith: "fetch" as "fetch" | "browser",
    content: text.slice(0, MAX_PAGE_CHARS),
    truncated: text.length > MAX_PAGE_CHARS,
    note: undefined as string | undefined
  };

  const needsBrowser =
    BLOCKED_STATUSES.has(res.status) ||
    (isHtml && text.length < MIN_STATIC_TEXT);
  if (!browser || !needsBrowser) return result;

  try {
    const page = await renderPageText(browser, parsed.toString());
    if (page.text.trim().length > text.length) {
      return {
        ...result,
        url: page.url,
        status: 200,
        renderedWith: "browser" as const,
        content: `${page.title}

${page.text}`.slice(0, MAX_PAGE_CHARS),
        truncated: page.text.length > MAX_PAGE_CHARS
      };
    }
  } catch (e) {
    // Browser limit hit or page too slow; return what we have.
    result.note = `Browser rendering unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }
  return result;
}

// Give errors back to the AI instead of crashing, so it can try something else.
async function safely(fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function connectionFor(slug: ToolSlug) {
  return TOOL_CATALOG.find((t) => t.slug === slug)?.connection ?? null;
}

export async function buildTools({
  granted,
  timezone,
  memory,
  memorySource,
  workspace,
  browser,
  requireApproval,
  trace,
  calls,
  searchApiKey
}: {
  granted: ToolSlug[];
  timezone: string;
  memory: MemoryStore;
  memorySource: Memory["source"];
  workspace: WorkspaceTools | null;
  // Cloudflare's browser, used for JavaScript-heavy pages.
  browser?: BrowserWorker;
  // True in chat: ask before sending or posting.
  requireApproval: boolean;
  // Extra fields added to every tool log line (agentId, runId).
  trace?: Record<string, string>;
  // If given, every tool call is recorded here (used for the run's steps).
  calls?: ToolCallRecord[];
  // Optional Tavily key for reliable web search.
  searchApiKey?: string;
}): Promise<ToolSet> {
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

  for (const slug of granted) {
    if (slug === "web_search") {
      tools.web_search = tool({
        description:
          "Search the public web. Returns titles, URLs and snippets. Set recent for news (e.g. 'week' for this week). Then use web_fetch to read the most relevant pages.",
        inputSchema: z.object({
          query: z.string().min(2).describe("Search query"),
          recent: z
            .enum(["day", "week", "month"])
            .optional()
            .describe("Only recent news from this period")
        }),
        execute: ({ query, recent }) =>
          safely(() => webSearch(query, { apiKey: searchApiKey, recent }))
      });
      tools.web_fetch = tool({
        description:
          "Fetch a public web page or JSON API and return its readable text. JavaScript-heavy pages are automatically rendered in a real browser.",
        inputSchema: z.object({
          url: z.string().url().describe("Absolute http(s) URL")
        }),
        execute: ({ url }) => safely(() => webFetch(url, browser))
      });
    } else if (slug === "current_time") {
      tools.current_time = tool({
        description: "Get the current date and time in the user's timezone.",
        inputSchema: z.object({}),
        execute: async () => ({
          timezone,
          localTime: new Date().toLocaleString("en-US", {
            timeZone: timezone,
            dateStyle: "full",
            timeStyle: "long"
          })
        })
      });
    } else if (slug === "hacker_news") {
      Object.assign(tools, hackerNewsTools());
    } else if (slug === "notion" && workspace) {
      for (const spec of await workspace.notionTools().catch(() => [])) {
        tools[spec.name] = tool({
          description: spec.description,
          inputSchema: jsonSchema(
            spec.inputSchema as Parameters<typeof jsonSchema>[0]
          ),
          needsApproval:
            requireApproval &&
            /create|update|move|delete|duplicate/i.test(spec.name),
          execute: (args) => safely(() => workspace.callTool(spec.name, args))
        });
      }
    } else if (workspace) {
      for (const t of INTEGRATION_TOOLS[slug] ?? []) {
        tools[t.name] = tool({
          description: t.description,
          inputSchema: t.input,
          needsApproval: requireApproval && !!t.sensitive,
          execute: (args) => safely(() => workspace.callTool(t.name, args))
        });
      }
    }
  }
  return withTracing(tools, trace, calls);
}

// Wrap every tool so each call is timed, logged and optionally recorded.
function withTracing(
  tools: ToolSet,
  trace: Record<string, string> = {},
  calls?: ToolCallRecord[]
): ToolSet {
  for (const [name, t] of Object.entries(tools)) {
    const original = (
      t as { execute?: (...args: unknown[]) => Promise<unknown> }
    ).execute;
    if (!original) continue;
    (t as { execute: (...args: unknown[]) => Promise<unknown> }).execute =
      async (...args) => {
        const started = Date.now();
        let output: unknown;
        let error: string | undefined;
        try {
          output = await original(...args);
          if (output && typeof output === "object" && "error" in output) {
            error = String((output as { error: unknown }).error).slice(0, 300);
          }
          return output;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          throw e;
        } finally {
          const record = {
            tool: name,
            ok: !error,
            ms: Date.now() - started,
            ...(error ? { error } : {})
          };
          calls?.push(record);
          log("tool_call", { ...trace, ...record });
        }
      };
  }
  return tools;
}
