// Profile: who's signed in, plus a few numbers about their agents.
import { useUser } from "@clerk/react";
import { Bot, CalendarDays, Mail, Plug, User2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";

export default function ProfilePage() {
  const { user } = useUser();
  const { state } = useWorkspace();
  const name = user?.fullName || "AMIGO user";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const totalRuns = (state?.agents ?? []).reduce((n, a) => n + a.totalRuns, 0);

  const details = [
    { icon: User2, label: "Name", value: name },
    { icon: Mail, label: "Email", value: email },
    {
      icon: CalendarDays,
      label: "Member since",
      value: formatDate(user?.createdAt?.toISOString())
    },
    {
      icon: Bot,
      label: "Agents",
      value: `${state?.agents.length ?? 0} agents · ${totalRuns} runs`
    },
    {
      icon: Plug,
      label: "Connected apps",
      value:
        state?.connections
          .filter((c) => c.connected)
          .map((c) => c.name)
          .join(", ") || "None yet"
    }
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account details.
      </p>

      <section className="mt-6 overflow-hidden rounded-2xl border shadow-sm">
        <div className="h-24 bg-[linear-gradient(90deg,#f38020,#faad3f,#8b5cf6)]" />
        <div className="-mt-10 flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar className="size-20 border-4 border-background">
            <AvatarImage src={user?.imageUrl} alt={name} />
            <AvatarFallback>{name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold">{name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{email}</span>
              <Badge className="bg-orange-100 text-orange-700">
                AMIGO on Cloudflare
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 divide-y rounded-2xl border shadow-sm">
        {details.map((d) => (
          <div key={d.label} className="flex items-center gap-4 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <d.icon className="size-4 text-slate-700" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <p className="truncate font-medium">{d.value}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
