// Login and access checks: users can only reach their own workspace and agents.
import { describe, expect, it } from "vitest";
import { agentOwner, authenticate, canAccess } from "@/lib/auth";

const env = (vars: Record<string, string> = {}) => vars as unknown as Env;

describe("agentOwner", () => {
  it("reads the owner from the agent ID", () => {
    expect(agentOwner("user_abc--1234-uuid")).toBe("user_abc");
  });

  it("returns null for IDs without an owner", () => {
    expect(agentOwner("1234-uuid")).toBeNull();
    expect(agentOwner("--1234")).toBeNull();
  });
});

describe("canAccess", () => {
  it("allows only your own workspace", () => {
    expect(canAccess("user_a", "Workspace", "user_a")).toBe(true);
    expect(canAccess("user_a", "Workspace", "user_b")).toBe(false);
  });

  it("allows only agents you own", () => {
    expect(canAccess("user_a", "AmigoAgent", "user_a--agent-1")).toBe(true);
    expect(canAccess("user_a", "AmigoAgent", "user_b--agent-1")).toBe(false);
    expect(canAccess("user_a", "AmigoAgent", "agent-without-owner")).toBe(
      false
    );
  });

  it("blocks anything else", () => {
    expect(canAccess("user_a", "SomethingElse", "user_a")).toBe(false);
  });
});

describe("authenticate", () => {
  it("rejects requests without a token", async () => {
    const req = new Request("https://example.com/agents/workspace/user_a");
    expect(
      await authenticate(req, env({ CLERK_SECRET_KEY: "sk_test_x" }))
    ).toBeNull();
  });

  it("rejects everything when Clerk isn't configured", async () => {
    const req = new Request(
      "https://example.com/agents/workspace/user_a?token=abc"
    );
    expect(await authenticate(req, env())).toBeNull();
  });

  it("rejects a fake token", async () => {
    const req = new Request(
      "https://example.com/agents/workspace/user_a?token=not-a-real-jwt"
    );
    expect(
      await authenticate(req, env({ CLERK_SECRET_KEY: "sk_test_x" }))
    ).toBeNull();
  });
});
