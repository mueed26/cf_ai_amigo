// Settings: workspace usage, how agents run, and display preferences.
import { useState, type ReactNode } from "react";
import { Bot, Cpu, Globe2, Moon, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/lib/workspace-context";
import { MAX_AGENTS } from "@/shared";

function readDark() {
  try {
    return localStorage.getItem("theme") === "dark";
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const { state } = useWorkspace();
  const [dark, setDark] = useState(readDark);
  const count = state?.agents.length ?? 0;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function toggleDark(on: boolean) {
    setDark(on);
    document.documentElement.classList.toggle("dark", on);
    try {
      localStorage.setItem("theme", on ? "dark" : "light");
    } catch {
      // storage blocked; the theme just won't be saved
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your workspace and how your agents run.
      </p>

      <section className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
              <Bot className="size-5 text-orange-700" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Workspace</h2>
                <Badge className="bg-orange-100 text-orange-700">
                  Cloudflare free plan
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                You can create up to {MAX_AGENTS} agents. Each one is its own
                Durable Object.
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {count}/{MAX_AGENTS} agents
          </div>
        </div>
        <Progress value={(count / MAX_AGENTS) * 100} className="mt-5" />
      </section>

      <section className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Runtime</h2>
        <div className="mt-5 space-y-5">
          <InfoRow
            icon={<Cpu className="size-4 text-orange-700" />}
            title="AI model"
            text="Llama 3.3 70B on Cloudflare Workers AI"
          />
          <Separator />
          <InfoRow
            icon={<Globe2 className="size-4 text-sky-700" />}
            title="Time zone"
            text={`Schedules use ${timezone} (from your browser).`}
          />
          <Separator />
          <InfoRow
            icon={<ShieldCheck className="size-4 text-green-700" />}
            title="Approvals"
            text="In chat, agents ask before sending emails, posting to Slack or creating docs."
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <div className="mt-5 flex items-center justify-between gap-4">
          <InfoRow
            icon={<Moon className="size-4 text-violet-700" />}
            title="Dark mode"
            text="Use a dark theme for the dashboard."
          />
          <Switch
            checked={dark}
            onCheckedChange={toggleDark}
            aria-label="Dark mode"
          />
        </div>
      </section>
    </div>
  );
}

function InfoRow({
  icon,
  title,
  text
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
