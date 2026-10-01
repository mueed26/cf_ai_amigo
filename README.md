# cf_ai_amigo — AMIGO on Cloudflare

**Describe a job in plain English. AMIGO designs an AI agent for it, schedules it, runs it durably, and lets it remember what it learned. Everything runs on Cloudflare.**

## Live demo

**👉 [cf-ai-amigo.mirmueed000.workers.dev](https://cf-ai-amigo.mirmueed000.workers.dev)**

1. Sign up with Clerk (email or Google, takes a few seconds).
2. Go to **Agents → Create Agent** and pick a suggestion, e.g. the Hacker News one.
3. Click **Run Agent**, then open **Chat With Agent** to ask follow-up questions.

Web search, Hacker News, memory, scheduling and chat work without connecting anything. Notion and Slack can be connected from **Integrations**.

> **⚠️ Google (Gmail and Docs) shows an "unverified app" warning**
>
> The Google integration is published but **not verified by Google**. Verifying apps that read Gmail requires a paid third-party security assessment and a custom domain, which isn't practical for a demo. So when you connect Google:
>
> 1. Google shows **"Google hasn't verified this app"**. Click **Advanced**, then **Go to cf-ai-amigo (unsafe)**.
> 2. On the permissions screen, **tick every box** (Gmail and Google Docs). The Integrations page warns you if one is missing.
>
> Unverified apps are limited by Google to 100 users. Access is only used to run tasks you set up (see the [privacy policy](https://cf-ai-amigo.mirmueed000.workers.dev/privacy)), and you can revoke it any time from your [Google account](https://myaccount.google.com/permissions).

> **Free plan limits:** the demo runs on Cloudflare's free plan (about 10,000 Workers AI neurons a day, roughly 8–10 agent runs shared by all users). If agents stop responding, the daily allowance has run out; it resets every day.

> _"Every weekday at 9am, give me the top 5 Hacker News stories about AI with a one-line summary each."_
>
> → Llama 3.3 designs the agent (instructions, tools, schedule `0 9 * * 1-5`), a Durable Object keeps its state, a DO alarm wakes it on schedule, a Workflow executes the run with retries, and the agent writes durable facts into its own SQLite memory so tomorrow's digest doesn't repeat today's.

This is the Cloudflare-native edition of [AMIGO AI](https://github.com/mueed26/AMIGO-AI), my prompt-to-agent platform originally built on Next.js, Gemini, the OpenAI Agents SDK, Inngest, Neon Postgres with Drizzle, Browserbase and Composio. For this assignment I rebuilt the backend on Cloudflare primitives.

## How it maps to the assignment

| Requirement                 | Implementation                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM**                     | **Llama 3.3 70B on Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) is used three ways: JSON-mode planning (prompt → config / clarifying questions), tool-calling execution of runs, and streaming chat.                     |
| **Workflow / coordination** | **Durable Objects** via the Agents SDK (`Workspace`, `AmigoAgent`), **DO alarms** via `this.schedule()` for cron and one-off runs, and a **Cloudflare Workflow** (`AgentRunWorkflow`) for durable, retried, multi-step run execution. |
| **User input via chat**     | React app served by Workers static assets. It talks to agents over WebSockets (`useAgent`, `useAgentChat`): a create-agent flow with clarifying questions, plus a live chat with each agent.                                          |
| **Memory / state**          | Each agent's **Durable Object SQLite** stores run history and long-term memory. **Agent state** (config, status, next run, live run progress) syncs to the UI in real time. The workspace registry is its own DO.                     |

## Integrations

Agents can act on real apps. There is no third-party integration platform: each connector is built directly on Workers + Durable Objects, and Notion uses the Agents SDK's own MCP client.

| Tool            | How it connects                                                                                                                                                              | Setup                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Web search**  | DuckDuckGo results + page fetch from the Worker; JavaScript-heavy or bot-blocked pages fall back to **Cloudflare Browser Run** (headless Chrome via `@cloudflare/puppeteer`) | None (Browser Run: 10 free min/day) |
| **Gmail**       | Google OAuth 2.0 (own flow in the Worker); tokens + refresh in the Workspace DO                                                                                              | Google Cloud OAuth client (free)    |
| **Google Docs** | Same Google connection                                                                                                                                                       | (same)                              |
| **Notion**      | **Notion's official remote MCP server** via `this.addMcpServer()`; the SDK handles OAuth + persistence                                                                       | None — click Connect                |
| **Slack**       | Slack Web API with a bot token                                                                                                                                               | Slack app + bot token (free)        |
| **Hacker News** | Official Algolia HN Search API, called from the Worker                                                                                                                       | None                                |

**Credentials never leave the Workspace Durable Object.** Agents and Workflows only see tool names and schemas; when the model calls a tool, the call is made over DO RPC to the Workspace, which attaches the token, calls the API, and returns the result. The synced UI state only contains connection status.

**Human-in-the-loop.** In chat, actions that send or create something (`gmail_send`, `slack_post_message`, `docs_create`, Notion writes…) pause for an Approve/Deny click (AI SDK tool approvals). Scheduled runs act autonomously — the user approved those tools when creating the agent.

## Authentication & authorization

- **Authentication — Clerk.** Users sign in or sign up with Clerk (`@clerk/react`). The Worker verifies the Clerk session JWT (`@clerk/backend` `verifyToken`, with `authorizedParties` locked to the app's origin) in `routeAgentRequest`'s `onBeforeConnect` / `onBeforeRequest` hooks, before any request reaches a Durable Object.
- **Authorization — ownership is encoded in Durable Object names.** A user's Workspace DO is named by their Clerk user id, and every AmigoAgent DO is named `<userId>--<uuid>`. The Worker rejects any connection whose target isn't owned by the caller (403), without an extra round-trip.
- **Server-authoritative state.** `validateStateChange` rejects client-originated state writes; all mutations go through `@callable` methods.
- **OAuth.** Google's flow starts from a Clerk-authenticated request and is bound to a single-use, 10-minute `state` nonce stored in the user's Workspace. Notion's MCP OAuth is handled by the Agents SDK.

## Architecture

```
Browser (React, Workers static assets)
   │  WebSocket: state sync + @callable RPC + chat stream
   ▼
Worker  ──routeAgentRequest──►  Workspace DO  (one per user workspace)
                                  • plan(): Llama 3.3 JSON mode → questions | config
                                  • createAgent()/deleteAgent()
                                  • state: registry of agent summaries (live dashboard)
                                  • connection hub: OAuth tokens (SQLite), Notion MCP client,
                                    callTool() executes Gmail/Docs/Slack/Notion calls
                                         │ getAgentByName (DO RPC)          ▲ callTool (DO RPC)
                                         ▼                                   │
                                AmigoAgent DO (one per agent; AIChatAgent)
                                  • state: config, status, nextRunAt, activeRun
                                  • SQLite: runs, memories
                                  • chat: streamText(Llama 3.3, tools)
                                  • this.schedule(cron | date) ──alarm──► scheduledRun()
                                         │ runWorkflow()
                                         ▼
                                AgentRunWorkflow (Cloudflare Workflows)
                                  1. load-context   (RPC → agent)
                                  2. execute        (Llama 3.3 + tools, retried w/ backoff)
                                  3. reflect        (Llama 3.3 JSON → new memories, best-effort)
                                  4. save-result    (RPC → agent → broadcast + workspace sync)
```

**Design notes**

- **One Durable Object per agent.** Each agent's schedule, history and memory are isolated and strongly consistent. It scales horizontally, with no shared database or cron server.
- **Workflows for execution, the DO for coordination.** LLM runs with several tool calls can be slow and flaky. Each step's result is persisted, so a retry never repeats a completed step (for example, it won't re-run the LLM after the result was produced). Progress is streamed back with `reportProgress`, so the "Run now" button shows the live step.
- **Server-authoritative state.** `validateStateChange` rejects client-originated writes. All mutations go through `@callable` methods.
- **Timezones.** DO alarms are UTC. The planner emits cron in the user's local time, and `localCronToUtc` shifts the minute and hour (and the weekday when a run crosses midnight). Tested for IST, EST and others; see [`src/lib/schedule.ts`](src/lib/schedule.ts).
- **Free to run.** Everything fits in the Workers Free plan (Workers AI includes 10,000 neurons/day, roughly 8–10 full agent runs). Integrations use free API tiers.

## Project structure

```
src/
  server.ts                 Worker entry: routes /agents/* to Durable Objects
  shared.ts                 Types + tool catalog shared by server and client
  agents/workspace.ts       Workspace DO: planner, agent registry, connection hub
  agents/amigo-agent.ts     AmigoAgent DO: chat, schedule, runs, memory
  workflows/agent-run.ts    AgentRunWorkflow: durable run pipeline
  lib/planner.ts            Llama 3.3 JSON-mode prompt-to-agent planner
  lib/tools.ts              Builds each agent's tool set (web, memory, integrations)
  lib/integrations/         Gmail + Docs, Slack connectors
  lib/hackernews.ts         Hacker News tools (no key)
  lib/browser.ts            Browser Run fallback (render JS pages)
  lib/auth.ts               Clerk verification + ownership checks
  lib/schedule.ts           Local-time cron/datetime → UTC
  app.tsx, pages/           React UI routes (landing, dashboard, agents, runs, integrations…)
  components/               shadcn/Base UI kit + agent, run and dashboard components
wrangler.jsonc              Workers AI, DO, Workflow bindings
PROMPTS.md                  Prompts the app sends to Llama 3.3
```

## Run it locally

Prerequisites: Node.js 20+, a free Cloudflare account and a free [Clerk](https://dashboard.clerk.com) application. Workers AI always runs on Cloudflare, even in local dev, so wrangler needs to be logged in.

```bash
npm install
npx wrangler login
cp .dev.vars.example .dev.vars   # then fill in CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). Web search, memory and Notion work immediately. For the other integrations, copy `.dev.vars.example` to `.dev.vars`, fill in what you want, and restart `npm run dev`:

- **Google (Gmail + Docs):** [Google Cloud Console](https://console.cloud.google.com/) → new project → enable **Gmail API** and **Google Docs API** → OAuth consent screen (External, add yourself as a test user) → Credentials → OAuth client ID (Web application) with redirect URI `http://localhost:5173/oauth/google/callback`.
- **Slack:** no env vars. Create an app at [api.slack.com/apps](https://api.slack.com/apps), add the bot scopes listed on the Integrations page, install it, and paste the bot token into the Integrations page.

When connecting Google, tick **every** permission box on Google's screen. The Integrations page warns you if a permission is missing.

Then try it:

1. Sign in, open **Agents → Create Agent**, and pick a suggestion (or write your own).
2. Watch Llama 3.3 write the config live. Answer any questions it asks, and the agent is created.
3. Click **Run Agent** and watch its steps update live. The result appears in **Runs** and on the **Dashboard**.
4. Open **⋯ → View Memory** to see what the agent remembered. Run it again and it uses those memories.
5. Click **Chat With Agent** to ask follow-up questions. Actions like sending email wait for your **Approve**.
6. Use **⋯ → Edit Agent** to change its schedule or tools, or **⋯ → Pause Agent** to stop its schedule.

## Deploy

```bash
npm run deploy
```

This builds the app and runs `wrangler deploy`, which creates the Worker, Durable Objects and Workflow. The app is then live at `https://cf-ai-amigo.<your-subdomain>.workers.dev`.

Then add the same secrets as `.dev.vars` to the deployed Worker:

```bash
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Also add `https://cf-ai-amigo.<your-subdomain>.workers.dev/oauth/google/callback` as a redirect URI on your Google OAuth client.

## Tests and CI/CD

```bash
npm run check   # formatting (oxfmt), lint (oxlint) and TypeScript typecheck
npm test        # unit tests (Vitest)
```

The tests cover the parts most likely to break: time zone to UTC cron conversion, the fix for Llama 3.3's duplicated stream chunks, login and ownership checks, the streaming planner (including dropping invented tools), web search parsing and the Hacker News tools.

GitHub Actions ([`.github/workflows/sanity-check.yml`](.github/workflows/sanity-check.yml)) runs the checks, tests and build on every push and pull request. Pushes to `main` that pass are **deployed to Cloudflare automatically**, then the pipeline checks `/api/health` on the live site. Auto-deploy needs two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Runs are traced with structured JSON logs (`run_start`, `tool_call`, `run_finish`, each with the run ID, tool, duration and errors), searchable in Workers Logs, and each run's tool calls are shown as **Steps** in the app.

## Security notes and limitations

- Clerk session tokens are passed in the WebSocket URL (browsers cannot set WebSocket headers). They are short-lived (~60s) and only used for the handshake.
- `web_search` uses DuckDuckGo's HTML endpoint and is best-effort; an AI Search binding would be the production choice. Browser Run is only used when a plain fetch returns too little text, to stay within the free 10 browser-minutes/day.
- Google Docs uses the `drive.file` scope, so agents can read docs they created (or ones explicitly shared with the app), not your whole Drive. That's a deliberate least-privilege choice.
- Tokens sit in Durable Object storage, which Cloudflare encrypts at rest. Application-level encryption with a key in a Worker secret would be the next hardening step.
- Cron conversion uses the current UTC offset, so after a DST change, re-save a schedule (pause and resume).

## Prompts

The prompts the app sends to Llama 3.3 (agent planner, agent system prompt, run prompt and memory reflection) are in [PROMPTS.md](PROMPTS.md).
