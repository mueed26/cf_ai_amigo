// Main server entry.
// /api/health: health check
// /api/config: Clerk key for the front end
// /agents/...: agents (login required)
// /oauth/google/..., /oauth/slack/...: Google and Slack logins
// everything else: the React app
import { getAgentByName, routeAgentRequest } from "agents";
import { authenticate, canAccess, clerkConfig, unauthorized } from "./lib/auth";
import { popupResponse } from "./agents/workspace";

export { Workspace } from "./agents/workspace";
export { AmigoAgent } from "./agents/amigo-agent";
export { AgentRunWorkflow } from "./workflows/agent-run";

// Google and Slack logins. "start" needs the user's Clerk token; the callback
// is proven by the one-time state code (the provider won't send our token).
async function handleOAuth(request: Request, env: Env, url: URL) {
  const match = url.pathname.match(
    /^\/oauth\/(google|slack)\/(start|callback)$/
  );
  if (!match) return null;
  const [, provider, step] = match as unknown as [
    string,
    "google" | "slack",
    string
  ];
  const redirectUri = `${url.origin}/oauth/${provider}/callback`;

  try {
    if (step === "start") {
      const userId = await authenticate(request, env);
      if (!userId) return popupResponse(false, "Please sign in again.");
      const workspace = await getAgentByName(env.Workspace, userId);
      const authUrl =
        provider === "google"
          ? await workspace.beginGoogleOAuth(redirectUri)
          : await workspace.beginSlackOAuth(redirectUri);
      return Response.redirect(authUrl, 302);
    }

    const state = url.searchParams.get("state") ?? "";
    const sep = state.lastIndexOf(":");
    const [workspaceId, nonce] = [state.slice(0, sep), state.slice(sep + 1)];
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error) return popupResponse(false, error);
    if (!code || sep <= 0 || !nonce) {
      return popupResponse(false, "Invalid OAuth callback.");
    }
    const workspace = await getAgentByName(env.Workspace, workspaceId);
    if (provider === "google")
      await workspace.completeGoogleOAuth(nonce, code, redirectUri);
    else await workspace.completeSlackOAuth(nonce, code, redirectUri);
    return popupResponse(true);
  } catch (e) {
    return popupResponse(false, e instanceof Error ? e.message : String(e));
  }
}

// Notion's login redirect; the Agents SDK checks it itself.
function isMcpOAuthCallback(url: URL, className: string) {
  return className === "Workspace" && /\/callback(\/|$)/.test(url.pathname);
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Simple health check for uptime monitors and the deploy pipeline.
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "cf-ai-amigo",
        time: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/config") {
      return Response.json({
        clerkPublishableKey: clerkConfig(env).CLERK_PUBLISHABLE_KEY ?? null
      });
    }

    if (url.pathname.startsWith("/oauth/")) {
      const response = await handleOAuth(request, env, url);
      if (response) return response;
    }

    const guard = async (
      req: Request,
      lobby: { className: string; name: string }
    ) => {
      if (isMcpOAuthCallback(new URL(req.url), lobby.className)) return;
      const userId = await authenticate(req, env);
      if (!userId) return unauthorized();
      if (!canAccess(userId, lobby.className, lobby.name)) {
        return new Response("Forbidden", { status: 403 });
      }
    };

    return (
      (await routeAgentRequest(request, env, {
        onBeforeConnect: guard,
        onBeforeRequest: guard
      })) || new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
