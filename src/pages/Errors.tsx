// Friendly 404 and crash pages.
import { Component, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function ErrorShell({
  code,
  title,
  text,
  action
}: {
  code: string;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fffdf8_0%,#fff4ea_60%,#f7f3ff_100%)] px-5">
      <div className="w-full max-w-md rounded-2xl border bg-white/90 p-8 text-center shadow-xl shadow-orange-100">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <TriangleAlert className="size-7" />
        </div>
        <p className="mt-5 text-sm font-semibold tracking-[0.2em] text-brand">
          {code}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        <div className="mt-6 flex justify-center">{action}</div>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <ErrorShell
      code="404"
      title="This page wandered off"
      text="The page you're looking for doesn't exist or was moved."
      action={
        <Link to="/">
          <Button>
            <ArrowLeft /> Back home
          </Button>
        </Link>
      }
    />
  );
}

// Catches crashes anywhere below it and shows a friendly page.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorShell
        code="ERROR"
        title="Something went wrong"
        text={this.state.error.message || "An unexpected error happened."}
        action={
          <Button onClick={() => window.location.reload()}>
            <RefreshCw /> Reload
          </Button>
        }
      />
    );
  }
}
