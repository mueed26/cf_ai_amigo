// Integrations page: connect Google, Notion and Slack, and see built-in tools.
import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/lib/workspace-context";
import { toastError, toastSuccess } from "@/lib/format";
import type { ConnectionId, ConnectionStatus } from "@/shared";

const LOGOS: Record<ConnectionId, string> = {
  google: "https://cdn.simpleicons.org/gmail",
  notion: "https://cdn.simpleicons.org/notion",
  slack: "https://cdn.simpleicons.org/slack"
};

const DESCRIPTIONS: Record<ConnectionId, string> = {
  google:
    "Read and send Gmail, and create or update Google Docs. Signs in with Google OAuth.",
  notion:
    "Search, read and write Notion pages through Notion's official MCP server.",
  slack: "Read channels and post messages with your Slack bot."
};

const BUILT_IN = [
  {
    name: "Web Search",
    logo: "https://cdn.simpleicons.org/duckduckgo",
    description:
      "Search the web and read pages. JavaScript-heavy pages open in Cloudflare Browser Run."
  },
  {
    name: "Hacker News",
    logo: "https://cdn.simpleicons.org/ycombinator",
    description:
      "Search stories, read the front page and comment threads. No key needed."
  },
  {
    name: "Memory",
    logo: "https://cdn.simpleicons.org/cloudflare",
    description:
      "Every agent remembers facts between runs in its own Durable Object."
  }
];

// Open the popup right away so the browser doesn't block it.
function openPopup() {
  return window.open("about:blank", "amigo-oauth", "width=520,height=720");
}

export default function IntegrationsPage() {
  const { workspace, state } = useWorkspace();
  const { getToken } = useAuth();
  const [busy, setBusy] = useState<ConnectionId | null>(null);
  const [slackOpen, setSlackOpen] = useState(false);
  const [slackToken, setSlackToken] = useState("");

  async function run(id: ConnectionId, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      toastError(e, "Connection failed");
    } finally {
      setBusy(null);
    }
  }

  function connect(c: ConnectionStatus) {
    if (c.id === "slack") return setSlackOpen(true);
    const popup = openPopup();
    if (c.id === "google") {
      // Pass the login token so the server knows who is connecting.
      run("google", async () => {
        const token = (await getToken()) ?? "";
        if (popup)
          popup.location.href = `/oauth/google/start?token=${encodeURIComponent(token)}`;
      });
    } else {
      run("notion", async () => {
        const { authUrl } = await workspace.stub.connectNotion();
        if (authUrl && popup) popup.location.href = authUrl;
        else popup?.close();
      });
    }
  }

  return (
    <div className="p-10 md:px-10 lg:px-24">
      <h2 className="text-3xl font-bold">Integrations</h2>
      <p className="mt-1 text-muted-foreground">
        Connect the apps your agents need. Logins stay inside your Workspace on
        Cloudflare and never reach the browser.
      </p>

      <h3 className="mt-8 text-lg font-semibold">Apps</h3>
      <div className="mt-3 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {!state &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}

        {state?.connections.map((c) => {
          const notConfigured = !c.connected && c.id === "google" && !!c.detail;
          return (
            <div key={c.id} className="flex flex-col rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <img src={LOGOS[c.id]} width={32} height={32} alt="" />
                <Badge
                  className={
                    c.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }
                >
                  {c.connected ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <h2 className="mt-3 text-lg font-medium">{c.name}</h2>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {DESCRIPTIONS[c.id]}
              </p>
              {c.account && (
                <p className="mt-2 truncate text-xs text-green-700">
                  {c.account}
                </p>
              )}
              {c.detail && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  {c.detail}
                </p>
              )}
              <div className="mt-auto pt-4">
                {c.connected ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() =>
                      run(c.id, async () => {
                        await workspace.stub.disconnect(c.id);
                        toastSuccess(`${c.name} disconnected`);
                      })
                    }
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={busy !== null || notConfigured}
                    onClick={() => connect(c)}
                  >
                    {busy === c.id && <Loader2 className="animate-spin" />}
                    Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-10 text-lg font-semibold">Built in</h3>
      <div className="mt-3 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {BUILT_IN.map((t) => (
          <div key={t.name} className="rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <img src={t.logo} width={28} height={28} alt="" />
              <Badge className="bg-orange-100 text-orange-700">Always on</Badge>
            </div>
            <h2 className="mt-3 text-lg font-medium">{t.name}</h2>
            <p className="text-sm text-muted-foreground">{t.description}</p>
          </div>
        ))}
      </div>

      <Dialog open={slackOpen} onOpenChange={setSlackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Slack</DialogTitle>
            <DialogDescription>
              Create a Slack app at api.slack.com/apps with the bot scopes
              chat:write, chat:write.public, channels:read, channels:history and
              channels:join. Install it, then paste the Bot User OAuth Token
              below.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            autoComplete="off"
            placeholder="xoxb-…"
            value={slackToken}
            onChange={(e) => setSlackToken(e.target.value)}
            className="font-mono"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlackOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!slackToken.trim() || busy !== null}
              onClick={() =>
                run("slack", async () => {
                  await workspace.stub.connectSlack(slackToken);
                  setSlackToken("");
                  setSlackOpen(false);
                  toastSuccess("Slack connected");
                })
              }
            >
              {busy === "slack" && <Loader2 className="animate-spin" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
