// Dashboard sidebar: pages, account and a small Cloudflare status card.
import { useLocation, useNavigate } from "react-router";
import { UserButton, useUser } from "@clerk/react";
import { AppWindow, Blocks, Bot, Play, Settings, User2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuButton
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/lib/workspace-context";
import { MAX_AGENTS } from "@/shared";

const workspaceLinks = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: AppWindow,
    color: "bg-orange-100 text-orange-900"
  },
  {
    to: "/dashboard/agents",
    label: "Agents",
    icon: Bot,
    color: "bg-green-100 text-green-900"
  },
  {
    to: "/dashboard/runs",
    label: "Runs",
    icon: Play,
    color: "bg-red-100 text-red-900"
  },
  {
    to: "/dashboard/integrations",
    label: "Integrations",
    icon: Blocks,
    color: "bg-purple-100 text-purple-900"
  }
];

const userLinks = [
  {
    to: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    color: "bg-gray-100 text-gray-900"
  },
  {
    to: "/dashboard/profile",
    label: "Profile",
    icon: User2,
    color: "bg-yellow-100 text-yellow-900"
  }
];

export function AppSidebar() {
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const { user } = useUser();
  const { state, connected } = useWorkspace();
  const agentCount = state?.agents.length ?? 0;
  const appsConnected =
    state?.connections.filter((c) => c.connected).length ?? 0;

  const renderLink = (link: (typeof workspaceLinks)[number]) => (
    <SidebarMenuButton
      key={link.to}
      onClick={() => navigate(link.to)}
      className={`h-12 gap-3 hover:bg-slate-100 ${path === link.to ? "bg-slate-100" : ""}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${link.color}`}
      >
        <link.icon className="h-[18px] w-[18px]" />
      </div>
      <span>{link.label}</span>
    </SidebarMenuButton>
  );

  return (
    <Sidebar>
      <SidebarHeader className="flex flex-row items-center gap-2.5 px-4 py-4">
        <img src="/logo.svg" alt="logo" width={36} height={36} />
        <div className="leading-tight">
          <h2 className="text-lg font-semibold text-slate-900">AMIGO</h2>
          <p className="text-[11px] font-semibold text-brand">on Cloudflare</p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="flex gap-1">
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          {workspaceLinks.map(renderLink)}
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Users</SidebarGroupLabel>
          {userLinks.map(renderLink)}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-2 rounded-lg border p-2 text-sm">
          <h2 className="flex justify-between">
            Agents{" "}
            <span>
              {agentCount}/{MAX_AGENTS}
            </span>
          </h2>
          <h2 className="flex justify-between">
            Apps connected{" "}
            <span>
              {appsConnected}/{state?.connections.length ?? 0}
            </span>
          </h2>
          <Progress value={(agentCount / MAX_AGENTS) * 100} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`size-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            />
            {connected ? "Live on Cloudflare" : "Connecting…"}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2.5 p-2">
          <UserButton />
          <span className="truncate text-sm">
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
