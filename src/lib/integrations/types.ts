// Shared types for app tools. These tools run inside the Workspace,
// which holds the logins, so tokens never reach the agents.
import type { z } from "zod";

export type Provider = "google" | "slack";

export type IntegrationContext = {
  env: Env;
  // Get a valid token for an app (refreshed if expired).
  getToken(provider: Provider): Promise<string>;
};

export type IntegrationTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  input: S;
  // True if the tool sends or creates something; chat asks for approval first.
  sensitive?: boolean;
  run(ctx: IntegrationContext, args: z.infer<S>): Promise<unknown>;
};

export function defineTool<S extends z.ZodType>(
  t: IntegrationTool<S>
): IntegrationTool {
  return t as unknown as IntegrationTool;
}

// Fetch JSON and throw a clear error if it fails.
export async function api<T = unknown>(
  url: string,
  init: RequestInit & { token?: string } = {}
) {
  const { token, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.body && typeof rest.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...headers
    }
  });
  const text = await res.text();
  if (
    res.status === 403 &&
    text.includes("insufficient authentication scopes")
  ) {
    throw new Error(
      "Google didn't grant this permission. Reconnect Google on the Integrations page and tick every box."
    );
  }
  if (!res.ok) {
    throw new Error(
      `${new URL(url).host} returned HTTP ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}
