// Dashboard shell: login check, sidebar and the live Workspace connection.
import { Navigate, Outlet } from "react-router";
import { useAuth } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { WorkspaceProvider } from "@/lib/workspace-context";

export default function DashboardLayout() {
  const { isLoaded, isSignedIn, userId } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isSignedIn || !userId) return <Navigate to="/sign-in" replace />;

  return (
    // key: a different user gets a fresh connection
    <WorkspaceProvider key={userId} userId={userId}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarTrigger />
        <div className="min-w-0 flex-1 overflow-x-hidden">
          <Outlet />
        </div>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}
