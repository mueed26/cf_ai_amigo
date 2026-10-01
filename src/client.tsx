import "./styles.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ClerkProvider } from "@clerk/react";
import { Toaster } from "@/components/ui/toast";
import App from "./app";

const root = createRoot(document.getElementById("root")!);

// Get the Clerk key from the server, then start the app.
fetch("/api/config")
  .then((r) => r.json() as Promise<{ clerkPublishableKey: string | null }>)
  .then(({ clerkPublishableKey }) => {
    if (!clerkPublishableKey) {
      root.render(
        <div className="mx-auto max-w-lg p-10">
          <h1 className="text-2xl font-semibold">Clerk is not configured</h1>
          <p className="mt-2 text-muted-foreground">
            Add CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to .dev.vars (see
            .dev.vars.example) and restart npm run dev.
          </p>
        </div>
      );
      return;
    }
    root.render(
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <BrowserRouter>
          <Toaster>
            <App />
          </Toaster>
        </BrowserRouter>
      </ClerkProvider>
    );
  })
  .catch((e) => {
    root.render(
      <pre className="p-8">Failed to load app config: {String(e)}</pre>
    );
  });
