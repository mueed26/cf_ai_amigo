// Web search parsing, HTML cleanup and the Hacker News tools.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDuckDuckGo, webSearch } from "@/lib/tools";
import { htmlToText } from "@/lib/text";
import { hackerNewsTools } from "@/lib/hackernews";

describe("htmlToText", () => {
  it("drops scripts and tags and decodes entities", () => {
    const html =
      "<head><title>x</title></head><script>alert(1)</script><p>Tom &amp; Jerry</p><p>&quot;hi&quot;</p>";
    expect(htmlToText(html)).toBe('Tom & Jerry\n "hi"');
  });
});

describe("parseDuckDuckGo", () => {
  it("reads results from the html page and unwraps redirect links", () => {
    const html = `
      <div class="result results_links">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdevelopers.cloudflare.com%2Fagents%2F&amp;rut=x">Cloudflare <b>Agents</b></a>
        <a class="result__snippet" href="#">Build agents on Cloudflare.</a>
      </div>`;
    expect(parseDuckDuckGo(html)).toEqual([
      {
        title: "Cloudflare Agents",
        url: "https://developers.cloudflare.com/agents/",
        snippet: "Build agents on Cloudflare."
      }
    ]);
  });

  it("reads results from the lite page", () => {
    const html = `<a rel="nofollow" href="https://example.com/a" class='result-link'>Example</a>
      <td class='result-snippet'>An example site.</td>`;
    expect(parseDuckDuckGo(html)).toEqual([
      {
        title: "Example",
        url: "https://example.com/a",
        snippet: "An example site."
      }
    ]);
  });

  it("returns nothing for a page without results", () => {
    expect(parseDuckDuckGo("<html><body>No results</body></html>")).toEqual([]);
  });
});

describe("Hacker News tools", () => {
  afterEach(() => vi.unstubAllGlobals());

  const options = { toolCallId: "test", messages: [] };
  const hit = {
    objectID: "42",
    title: "Show HN: AMIGO",
    url: null,
    author: "mueed",
    points: 100,
    num_comments: 10,
    created_at: "2026-10-01T00:00:00Z"
  };

  it("searches recent stories and links to the discussion", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      Response.json({ hits: [hit] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const tools = hackerNewsTools();
    const stories = await tools.hn_search.execute!(
      { query: "cloudflare", sort: "date", period: "week", limit: 5 },
      options
    );

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v1/search_by_date");
    expect(url.searchParams.get("numericFilters")).toMatch(
      /^created_at_i>\d+$/
    );
    expect(stories).toEqual([
      expect.objectContaining({
        id: "42",
        // No link of its own, so it points at the HN discussion.
        url: "https://news.ycombinator.com/item?id=42",
        points: 100
      })
    ]);
  });

  it("reads a story's comments as plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: 42,
          title: "Show HN: AMIGO",
          url: "https://example.com",
          author: "mueed",
          points: 100,
          text: null,
          children: [
            {
              id: 1,
              author: "a",
              text: "<p>Nice &amp; fast</p>",
              children: [],
              title: null,
              url: null,
              points: null
            },
            {
              id: 2,
              author: "b",
              text: null,
              children: [],
              title: null,
              url: null,
              points: null
            }
          ]
        })
      )
    );

    const result = await hackerNewsTools().hn_story_comments.execute!(
      { story: "https://news.ycombinator.com/item?id=42", limit: 10 },
      options
    );
    expect(result).toMatchObject({
      id: 42,
      comments: [{ author: "a", text: "Nice & fast", replies: 0 }]
    });
  });

  it("reports API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    await expect(
      hackerNewsTools().hn_top_stories.execute!(
        { list: "top", limit: 3 },
        options
      )
    ).rejects.toThrow("HTTP 503");
  });
});

describe("webSearch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses Tavily news search when a key is set", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        Response.json({
          results: [
            {
              title: "Workers AI news",
              url: "https://blog.cloudflare.com/x",
              content: "New models.",
              published_date: "2026-09-30"
            }
          ]
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await webSearch("cloudflare workers ai", {
      apiKey: "tvly-test",
      recent: "week"
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.tavily.com/search"
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ topic: "news", time_range: "week" });
    expect(results).toEqual([
      {
        title: "Workers AI news",
        url: "https://blog.cloudflare.com/x",
        snippet: "New models.",
        published: "2026-09-30"
      }
    ]);
  });

  it("falls back to Wikipedia when DuckDuckGo is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("wikipedia.org")
          ? Response.json({
              query: {
                search: [
                  { title: "Cloudflare", snippet: "A <b>web</b> company" }
                ]
              }
            })
          : new Response("blocked", { status: 403 })
      )
    );

    expect(await webSearch("cloudflare")).toEqual([
      {
        title: "Cloudflare (Wikipedia)",
        url: "https://en.wikipedia.org/wiki/Cloudflare",
        snippet: "A web company"
      }
    ]);
  });

  it("explains what to do when every source fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    await expect(webSearch("anything")).rejects.toThrow("hacker_news");
  });
});
