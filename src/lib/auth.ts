// Login checks (Clerk) and access checks.
// Each user's Workspace is named by their user ID, and each agent's ID
// starts with its owner's user ID, so we can tell who owns what.
import { verifyToken } from "@clerk/backend";

export const AGENT_ID_SEPARATOR = "--";

export function agentOwner(agentName: string) {
  const i = agentName.indexOf(AGENT_ID_SEPARATOR);
  return i > 0 ? agentName.slice(0, i) : null;
}

type ClerkSecrets = {
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
};

export function clerkConfig(env: Env) {
  return env as unknown as ClerkSecrets;
}

// Returns the user ID if the login token is valid, otherwise null.
export async function authenticate(
  request: Request,
  env: Env
): Promise<string | null> {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  const { CLERK_SECRET_KEY } = clerkConfig(env);
  if (!token || !CLERK_SECRET_KEY) return null;
  try {
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
      // Only accept tokens made for this site.
      authorizedParties: [url.origin]
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// Can this user open this workspace or agent?
export function canAccess(userId: string, className: string, name: string) {
  if (className === "Workspace") return name === userId;
  if (className === "AmigoAgent") return agentOwner(name) === userId;
  return false;
}

export function unauthorized(message = "Unauthorized") {
  return new Response(message, { status: 401 });
}
