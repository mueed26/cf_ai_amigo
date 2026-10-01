// Hacker News tools using the free Algolia HN API (no key needed).
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { htmlToText } from "./text";

const API = "https://hn.algolia.com/api/v1";
const PERIOD_SECONDS = {
  day: 86_400,
  week: 604_800,
  month: 2_592_000,
  year: 31_536_000
};
// Which Algolia tag to use for each list.
const LIST_TAGS = {
  top: "front_page",
  new: "story",
  ask: "ask_hn",
  show: "show_hn"
};

type Hit = {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at: string;
};
type ItemTree = {
  id: number;
  title: string | null;
  url: string | null;
  author: string;
  points: number | null;
  text: string | null;
  children: ItemTree[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Hacker News API returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

const discussion = (id: string | number) =>
  `https://news.ycombinator.com/item?id=${id}`;

function toStory(h: Hit) {
  return {
    id: h.objectID,
    title: h.title,
    url: h.url ?? discussion(h.objectID),
    discussion: discussion(h.objectID),
    points: h.points,
    comments: h.num_comments,
    author: h.author,
    created: h.created_at
  };
}

export function hackerNewsTools(): ToolSet {
  return {
    hn_search: tool({
      description:
        "Search Hacker News stories by keyword. Sort by relevance or newest, optionally limited to a recent period.",
      inputSchema: z.object({
        query: z.string().min(2),
        sort: z.enum(["relevance", "date"]).default("relevance"),
        period: z.enum(["day", "week", "month", "year", "all"]).default("all"),
        limit: z.coerce.number().int().min(1).max(20).default(10)
      }),
      execute: async ({ query, sort, period, limit }) => {
        const params = new URLSearchParams({
          query,
          tags: "story",
          hitsPerPage: String(limit)
        });
        if (period !== "all") {
          const since = Math.floor(Date.now() / 1000) - PERIOD_SECONDS[period];
          params.set("numericFilters", `created_at_i>${since}`);
        }
        const endpoint = sort === "date" ? "search_by_date" : "search";
        const { hits } = await getJson<{ hits: Hit[] }>(
          `${API}/${endpoint}?${params}`
        );
        return hits.map(toStory);
      }
    }),

    hn_top_stories: tool({
      description:
        "List current Hacker News stories: the front page (top), newest, Ask HN or Show HN.",
      inputSchema: z.object({
        list: z.enum(["top", "new", "ask", "show"]).default("top"),
        limit: z.coerce.number().int().min(1).max(30).default(10)
      }),
      execute: async ({ list, limit }) => {
        const params = new URLSearchParams({
          tags: LIST_TAGS[list],
          hitsPerPage: String(limit)
        });
        // The front page is ranked; the other lists are newest first.
        const endpoint = list === "top" ? "search" : "search_by_date";
        const { hits } = await getJson<{ hits: Hit[] }>(
          `${API}/${endpoint}?${params}`
        );
        return hits.map(toStory);
      }
    }),

    hn_story_comments: tool({
      description:
        "Read a Hacker News story and its top-level comments (story id or HN URL).",
      inputSchema: z.object({
        story: z
          .string()
          .describe("Story id, e.g. 42424242, or a news.ycombinator.com URL"),
        limit: z.coerce.number().int().min(1).max(30).default(15)
      }),
      execute: async ({ story, limit }) => {
        const id = story.match(/id=(\d+)/)?.[1] ?? story.replace(/\D/g, "");
        if (!id) throw new Error("Pass a numeric story id or an HN item URL.");
        const item = await getJson<ItemTree>(`${API}/items/${id}`);
        return {
          id: item.id,
          title: item.title,
          url: item.url ?? discussion(item.id),
          points: item.points,
          text: item.text ? htmlToText(item.text).slice(0, 1500) : undefined,
          comments: item.children
            .filter((c) => c.text)
            .slice(0, limit)
            .map((c) => ({
              author: c.author,
              text: htmlToText(c.text ?? "").slice(0, 600),
              replies: c.children.length
            }))
        };
      }
    })
  };
}
