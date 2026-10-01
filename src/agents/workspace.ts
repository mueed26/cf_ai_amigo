// One per user. Plans new agents, keeps the user's list of agents,
// and holds their app logins (Google, Slack, Notion). App tools run here,
// so logins never leave this object.
import {
  Agent,
  callable,
  getAgentByName,
  type Connection,
  type StreamingResponse
} from "agents";
import { DurableObjectOAuthClientProvider } from "agents/mcp/do-oauth-client-provider";
import { AGENT_ID_SEPARATOR } from "../lib/auth";
import { findIntegrationTool } from "../lib/integrations";
import { GOOGLE_SCOPES } from "../lib/integrations/google";
import { secrets } from "../lib/integrations/secrets";
import { SLACK_BOT_SCOPES, slackApi } from "../lib/integrations/slack";
import type { Provider } from "../lib/integrations/types";
import { planAgent } from "../lib/planner";
import { parseJsonStrings } from "../lib/salvage";
import { MAX_AGENTS } from "../shared";
import type {
  AgentConfig,
  AgentRun,
  AgentStatus,
  Memory,
  RunWithAgent,
  AgentSummary,
  ConnectionStatus,
  PlanResult,
  WorkspaceState
} from "../shared";

const NOTION_MCP_URL = "https://mcp.notion.com/mcp";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
// Only expose a few Notion tools; the AI picks better from a short list.
const NOTION_TOOL_ALLOWLIST =
  /search|fetch|create-pages|update-page|create-comment/i;

// Same as the SDK's login helper, but shows "AMIGO" on Notion's login page
// instead of the user's ID.
class AmigoOAuthProvider extends DurableObjectOAuthClientProvider {
  get clientMetadata() {
    return { ...super.clientMetadata, client_name: "AMIGO on Cloudflare" };
  }
}

type TokenRow = {
  provider: Provider;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  account: string | null;
  // Permissions the user actually granted (space separated).
  scope: string | null;
};

export class Workspace extends Agent<Env, WorkspaceState> {
  initialState: WorkspaceState = { agents: [], connections: [] };

  createMcpOAuthProvider(callbackUrl: string) {
    return new AmigoOAuthProvider(this.ctx.storage, this.name, callbackUrl);
  }

  onStart() {
    // Agents saved by older versions miss newer card fields; refresh them.
    this.refreshOldSummaries().catch((e) =>
      console.warn("Summary refresh failed:", e)
    );
    this.sql`CREATE TABLE IF NOT EXISTS tokens (
      provider TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER,
      account TEXT
    )`;
    // Older workspaces don't have the scope column yet.
    try {
      this.sql`ALTER TABLE tokens ADD COLUMN scope TEXT`;
    } catch {
      // column already exists
    }
    this.sql`CREATE TABLE IF NOT EXISTS oauth_states (
      nonce TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`;
    // Close the popup after the Notion login finishes.
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        this.refreshConnections();
        return popupResponse(result.authSuccess, result.authError);
      }
    });
    this.refreshConnections();
  }

  validateStateChange(_next: WorkspaceState, source: Connection | "server") {
    if (source !== "server") throw new Error("State is read-only for clients.");
  }

  // Planning and managing agents

  // Design an agent from a prompt. Streams the AI's text as it's written,
  // then ends with the final result (questions or a ready config).
  @callable({ streaming: true })
  async plan(
    stream: StreamingResponse,
    input: {
      prompt: string;
      answers?: Record<string, string | string[]>;
      timezone: string;
    }
  ) {
    try {
      const prompt = input.prompt?.trim();
      if (!prompt) throw new Error("Describe what the agent should do.");
      if (prompt.length > 4000) throw new Error("Prompt is too long.");
      const result: PlanResult = await planAgent(
        this.env.AI,
        {
          ...input,
          prompt,
          timezone: safeTz(input.timezone),
          connected: this.state.connections
            .filter((c) => c.connected)
            .map((c) => c.id)
        },
        (delta) => stream.send(delta)
      );
      stream.end(result);
    } catch (e) {
      stream.error(e instanceof Error ? e.message : String(e));
    }
  }

  // Latest runs across all of this user's agents (dashboard and Runs page).
  @callable()
  async recentRuns(limit = 50): Promise<RunWithAgent[]> {
    const lists = await Promise.all(
      this.state.agents.map(async (a) => {
        try {
          const agent = await getAgentByName(this.env.AmigoAgent, a.id);
          const runs = (await agent.listRuns(20)) as AgentRun[];
          return runs.map((r) => ({
            ...r,
            agentId: a.id,
            agentName: a.name,
            agentImage: a.image ?? null,
            task: a.description
          }));
        } catch {
          return [];
        }
      })
    );
    return lists
      .flat()
      .sort((x, y) => y.startedAt.localeCompare(x.startedAt))
      .slice(0, limit);
  }

  @callable()
  async createAgent(input: { config: AgentConfig; timezone: string }) {
    if (this.state.agents.length >= MAX_AGENTS) {
      throw new Error(`A workspace can hold at most ${MAX_AGENTS} agents.`);
    }
    // Agent IDs start with the owner's user ID so we can check access.
    const id = `${this.name}${AGENT_ID_SEPARATOR}${crypto.randomUUID()}`;
    const agent = await getAgentByName(this.env.AmigoAgent, id);
    const summary = await agent.initialize({
      id,
      workspaceId: this.name,
      timezone: safeTz(input.timezone),
      config: input.config
    });
    this.setState({ ...this.state, agents: [summary, ...this.state.agents] });
    return id;
  }

  @callable()
  async deleteAgent(id: string) {
    if (!this.state.agents.some((a) => a.id === id))
      throw new Error("Unknown agent.");
    const agent = await getAgentByName(this.env.AmigoAgent, id);
    try {
      await agent.teardown();
    } catch (e) {
      // The agent wipes itself at the end of teardown, which ends this call
      // with a "destroyed" error. That means it worked.
      if (!/destroy/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    this.setState({
      ...this.state,
      agents: this.state.agents.filter((a) => a.id !== id)
    });
  }

  // Actions on one agent, so the dashboard doesn't need a connection per agent.
  // Each one checks the agent belongs to this workspace first.

  @callable()
  async runAgent(id: string) {
    return (await this.ownAgent(id)).runNow();
  }

  @callable()
  async setAgentStatus(id: string, status: AgentStatus) {
    await (await this.ownAgent(id)).setStatus(status);
  }

  @callable()
  async updateAgent(id: string, patch: Partial<AgentConfig>) {
    await (await this.ownAgent(id)).updateConfig(patch);
  }

  @callable()
  async getAgentConfig(id: string) {
    return (await (await this.ownAgent(id)).getConfig()) as AgentConfig;
  }

  @callable()
  async agentMemories(id: string) {
    return (await (await this.ownAgent(id)).listMemories()) as Memory[];
  }

  @callable()
  async forgetAgentMemory(id: string, memoryId: number) {
    return (await (await this.ownAgent(id)).forgetMemory(memoryId)) as Memory[];
  }

  private async ownAgent(id: string) {
    if (!this.state.agents.some((a) => a.id === id))
      throw new Error("Unknown agent.");
    return getAgentByName(this.env.AmigoAgent, id);
  }

  private async refreshOldSummaries() {
    const old = (this.state.agents ?? []).filter(
      (a) => !Array.isArray(a.tools)
    );
    for (const a of old) {
      const agent = await getAgentByName(this.env.AmigoAgent, a.id);
      this.upsertAgent((await agent.getSummary()) as AgentSummary);
    }
  }

  // Called by an agent when it changes. Ignored if the agent was deleted.
  upsertAgent(summary: AgentSummary) {
    if (!this.state.agents.some((a) => a.id === summary.id)) return;
    this.setState({
      ...this.state,
      agents: this.state.agents.map((a) => (a.id === summary.id ? summary : a))
    });
  }

  // App connections

  @callable()
  async connectSlack(botToken: string) {
    const token = botToken.trim();
    if (!token.startsWith("xoxb-"))
      throw new Error("Paste a Slack bot token (starts with xoxb-).");
    const auth = await slackApi<{ ok: boolean; team: string; user: string }>(
      token,
      "auth.test"
    );
    this.saveToken("slack", {
      access_token: token,
      account: `${auth.team} (@${auth.user})`
    });
  }

  // Start the Notion login and return the URL to open in a popup.
  @callable()
  async connectNotion(): Promise<{ authUrl: string | null }> {
    const result = await this.addMcpServer("notion", NOTION_MCP_URL);
    this.refreshConnections();
    return {
      authUrl: result.state === "authenticating" ? result.authUrl : null
    };
  }

  @callable()
  async disconnect(id: ConnectionStatus["id"]) {
    if (id === "notion") {
      const server = this.notionServer();
      if (server) await this.removeMcpServer(server.id);
    } else {
      this.sql`DELETE FROM tokens WHERE provider = ${id}`;
    }
    this.refreshConnections();
  }

  // Build the Google login URL.
  beginGoogleOAuth(redirectUri: string) {
    const { GOOGLE_CLIENT_ID } = secrets(this.env);
    if (!GOOGLE_CLIENT_ID)
      throw new Error("GOOGLE_CLIENT_ID is not configured.");
    const nonce = this.createOAuthState("google");
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: `${this.name}:${nonce}`
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // Finish the Google login and save the tokens.
  async completeGoogleOAuth(nonce: string, code: string, redirectUri: string) {
    this.useOAuthState("google", nonce);
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = secrets(this.env);
    const token = await googleTokenRequest({
      code,
      client_id: GOOGLE_CLIENT_ID ?? "",
      client_secret: GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });
    const profile = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { authorization: `Bearer ${token.access_token}` }
      }
    ).then((r) => r.json() as Promise<{ email?: string }>);
    this.saveToken("google", {
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: Date.now() + token.expires_in * 1000,
      account: profile.email ?? "Google account",
      scope: token.scope ?? null
    });
  }

  // Build the "Add to Slack" login URL.
  beginSlackOAuth(redirectUri: string) {
    const { SLACK_CLIENT_ID } = secrets(this.env);
    if (!SLACK_CLIENT_ID) throw new Error("SLACK_CLIENT_ID is not configured.");
    const nonce = this.createOAuthState("slack");
    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      scope: SLACK_BOT_SCOPES.join(","),
      redirect_uri: redirectUri,
      state: `${this.name}:${nonce}`
    });
    return `https://slack.com/oauth/v2/authorize?${params}`;
  }

  // Finish the Slack login and save the workspace's bot token.
  async completeSlackOAuth(nonce: string, code: string, redirectUri: string) {
    this.useOAuthState("slack", nonce);
    const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } = secrets(this.env);
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID ?? "",
        client_secret: SLACK_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri
      }).toString()
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      scope?: string;
      team?: { name?: string };
    };
    if (!data.ok || !data.access_token) {
      throw new Error(
        `Slack sign-in failed: ${data.error ?? "no token returned"}`
      );
    }
    this.saveToken("slack", {
      access_token: data.access_token,
      account: data.team?.name ?? "Slack workspace",
      scope: data.scope ?? null
    });
  }

  // One-time code that ties an OAuth callback to this workspace.
  private createOAuthState(provider: Provider) {
    const nonce = crypto.randomUUID();
    this
      .sql`DELETE FROM oauth_states WHERE created_at < ${Date.now() - OAUTH_STATE_TTL_MS}`;
    this.sql`INSERT INTO oauth_states (nonce, provider, created_at)
             VALUES (${nonce}, ${provider}, ${Date.now()})`;
    return nonce;
  }

  // Check and use up a one-time code (each one works once, for 10 minutes).
  private useOAuthState(provider: Provider, nonce: string) {
    const [state] = this.sql<{ created_at: number }>`
      DELETE FROM oauth_states WHERE nonce = ${nonce} AND provider = ${provider}
      RETURNING created_at`;
    if (!state || state.created_at < Date.now() - OAUTH_STATE_TTL_MS) {
      throw new Error("Sign-in link expired or invalid. Please try again.");
    }
  }

  // Running app tools for agents

  async notionTools() {
    const server = this.notionServer();
    if (!server) return [];
    await this.mcp.waitForConnections({ timeout: 10_000 });
    return this.mcp
      .listTools()
      .filter(
        (t) => t.serverId === server.id && NOTION_TOOL_ALLOWLIST.test(t.name)
      )
      .map((t) => ({
        name: t.name.replace(/[^a-zA-Z0-9_]/g, "_"),
        description: (t.description ?? t.name).slice(0, 1000),
        inputSchema: t.inputSchema
      }));
  }

  async callTool(name: string, args: unknown) {
    const integration = findIntegrationTool(name);
    if (integration) {
      return integration.run(
        { env: this.env, getToken: (p) => this.getToken(p) },
        integration.input.parse(args ?? {})
      );
    }

    // Notion tools come from Notion's MCP server.
    const server = this.notionServer();
    if (!server)
      throw new Error(`Unknown tool "${name}" or Notion is not connected.`);
    await this.mcp.waitForConnections({ timeout: 10_000 });
    const mcpTool = this.mcp
      .listTools()
      .find(
        (t) =>
          t.serverId === server.id &&
          t.name.replace(/[^a-zA-Z0-9_]/g, "_") === name
      );
    if (!mcpTool) throw new Error(`Unknown Notion tool "${name}".`);
    const result = await this.mcp.callTool({
      serverId: server.id,
      name: mcpTool.name,
      // The model often sends emoji icons Notion rejects; pages don't need them.
      arguments: withoutIcons(parseJsonStrings(args ?? {})) as Record<
        string,
        unknown
      >
    });
    const content = (result.content ?? []) as { type: string; text?: string }[];
    const text = content
      .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
      .join("\n")
      .slice(0, 12_000);
    // Notion reports failures as text, so turn them into real errors.
    if (result.isError) throw new Error(text || "Notion returned an error.");
    return text;
  }

  // Internal helpers

  private async getToken(provider: Provider): Promise<string> {
    const [row] = this
      .sql<TokenRow>`SELECT * FROM tokens WHERE provider = ${provider}`;
    const label = provider === "google" ? "Google (Gmail/Docs)" : "Slack";
    if (!row)
      throw new Error(
        `${label} is not connected. Connect it on the Integrations page.`
      );
    if (
      provider !== "google" ||
      !row.expires_at ||
      row.expires_at > Date.now() + 60_000
    ) {
      return row.access_token;
    }

    if (!row.refresh_token)
      throw new Error("Google session expired. Reconnect Google.");
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = secrets(this.env);
    const token = await googleTokenRequest({
      client_id: GOOGLE_CLIENT_ID ?? "",
      client_secret: GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token"
    });
    const expiresAt = Date.now() + token.expires_in * 1000;
    this
      .sql`UPDATE tokens SET access_token = ${token.access_token}, expires_at = ${expiresAt}
             WHERE provider = 'google'`;
    return token.access_token;
  }

  private saveToken(
    provider: Provider,
    t: Partial<Omit<TokenRow, "provider">> & { access_token: string }
  ) {
    this
      .sql`INSERT OR REPLACE INTO tokens (provider, access_token, refresh_token, expires_at, account, scope)
             VALUES (${provider}, ${t.access_token}, ${t.refresh_token ?? null},
                     ${t.expires_at ?? null}, ${t.account ?? null}, ${t.scope ?? null})`;
    this.refreshConnections();
  }

  private notionServer() {
    const servers = this.getMcpServers().servers;
    const id = Object.keys(servers).find((k) => servers[k].name === "notion");
    return id ? { id, ...servers[id] } : null;
  }

  // Update the connection list shown in the UI (no secrets).
  private refreshConnections() {
    const rows = this
      .sql<TokenRow>`SELECT provider, account, scope FROM tokens`;
    const account = (p: Provider) =>
      rows.find((r) => r.provider === p)?.account ?? null;
    const s = secrets(this.env);
    const notion = this.notionServer();
    const slackOAuth = !!(s.SLACK_CLIENT_ID && s.SLACK_CLIENT_SECRET);
    const googleConfigured = !!(s.GOOGLE_CLIENT_ID && s.GOOGLE_CLIENT_SECRET);

    const connections: ConnectionStatus[] = [
      {
        id: "google",
        name: "Google (Gmail + Docs)",
        method: "oauth",
        connected: !!account("google"),
        account: account("google"),
        detail: !googleConfigured
          ? "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README) to enable."
          : googlePermissionWarning(rows.find((r) => r.provider === "google"))
      },
      {
        id: "notion",
        name: "Notion",
        method: "oauth",
        connected: notion?.state === "ready",
        account: notion?.state === "ready" ? "Notion workspace" : null,
        detail:
          notion && notion.state !== "ready"
            ? notion.state === "failed"
              ? `Connection failed: ${notion.error ?? "unknown error"}`
              : `Status: ${notion.state}`
            : null
      },
      {
        id: "slack",
        name: "Slack",
        method: slackOAuth ? "oauth" : "token",
        connected: !!account("slack"),
        account: account("slack"),
        detail: null
      }
    ];
    if (
      JSON.stringify(connections) !== JSON.stringify(this.state.connections)
    ) {
      this.setState({ ...this.state, connections });
    }
  }

  // The UI calls this when the Notion connection changes.
  @callable()
  syncConnections() {
    this.refreshConnections();
  }
}

// Which Google permissions are missing from a connection, in plain words.
const GOOGLE_PERMISSION_NAMES: Record<string, string> = {
  "https://www.googleapis.com/auth/gmail.readonly": "read Gmail",
  "https://www.googleapis.com/auth/gmail.send": "send Gmail",
  "https://www.googleapis.com/auth/documents": "Google Docs",
  "https://www.googleapis.com/auth/drive.file": "Drive files made by the app"
};

function googlePermissionWarning(row: TokenRow | undefined) {
  if (!row) return null;
  if (!row.scope)
    return "Reconnect Google so we can confirm every permission was granted.";
  const granted = row.scope.split(" ");
  const missing = Object.keys(GOOGLE_PERMISSION_NAMES).filter(
    (s) => !granted.includes(s)
  );
  if (missing.length === 0) return null;
  return `Missing permission: ${missing.map((s) => GOOGLE_PERMISSION_NAMES[s]).join(", ")}. Disconnect, connect again and tick every box on Google's screen.`;
}

// Remove "icon" and "cover" fields anywhere in a Notion tool's arguments.
function withoutIcons(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIcons);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "icon" && key !== "cover")
        .map(([key, v]) => [key, withoutIcons(v)])
    );
  }
  return value;
}

async function googleTokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString()
  });
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok)
    throw new Error(
      `Google sign-in failed: ${data.error_description ?? data.error}`
    );
  return data;
}

export function popupResponse(ok: boolean, error?: string) {
  const message = ok
    ? "Connected! You can close this window."
    : `Connection failed: ${error ?? "unknown error"}`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>AMIGO</title>
<body style="font-family:system-ui;padding:2rem">${escapeHtml(message)}
<script>try{window.opener&&window.opener.postMessage({type:"amigo-oauth",ok:${ok}},"*")}catch(e){}${ok ? "setTimeout(()=>window.close(),800)" : ""}</script>`,
    {
      status: ok ? 200 : 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    }
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function safeTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
