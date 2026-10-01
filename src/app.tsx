// All pages and routes.
import { Navigate, Route, Routes } from "react-router";
import { SignIn, SignUp } from "@clerk/react";
import Landing from "@/pages/Landing";
import { ErrorBoundary, NotFoundPage } from "@/pages/Errors";
import DashboardLayout from "@/pages/dashboard/Layout";
import Overview from "@/pages/dashboard/Overview";
import AgentsPage from "@/pages/dashboard/Agents";
import RunsPage from "@/pages/dashboard/Runs";
import IntegrationsPage from "@/pages/dashboard/Integrations";
import SettingsPage from "@/pages/dashboard/Settings";
import ProfilePage from "@/pages/dashboard/Profile";

function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[linear-gradient(180deg,#fffdf8_0%,#fff3e8_50%,#f7f3ff_100%)] px-4 py-10">
      <a href="/" className="flex items-center gap-2">
        <img src="/logo.svg" alt="" width={34} height={34} />
        <span className="text-lg font-semibold">AMIGO</span>
        <span className="rounded-full border border-orange-200 bg-white/70 px-2 py-0.5 text-xs font-semibold text-orange-700">
          on Cloudflare
        </span>
      </a>
      {children}
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/sign-in/*"
          element={
            <AuthPage>
              <SignIn
                routing="path"
                path="/sign-in"
                signUpUrl="/sign-up"
                fallbackRedirectUrl="/dashboard"
              />
            </AuthPage>
          }
        />
        <Route
          path="/sign-up/*"
          element={
            <AuthPage>
              <SignUp
                routing="path"
                path="/sign-up"
                signInUrl="/sign-in"
                fallbackRedirectUrl="/dashboard"
              />
            </AuthPage>
          }
        />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
