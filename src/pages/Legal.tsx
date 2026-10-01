// Privacy policy and terms pages (linked from Google's sign-in screen).
import type { ReactNode } from "react";
import { Link } from "react-router";

const REPO_ISSUES = "https://github.com/mueed26/cf_ai_amigo/issues";

function LegalPage({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#fbfaf7] px-5 py-12">
      <article className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-white p-8 text-sm leading-6 text-slate-700 shadow-sm [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">
        <Link to="/" className="flex items-center gap-2 text-slate-900">
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span className="font-semibold">AMIGO on Cloudflare</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        <p className="text-xs text-slate-500">Last updated: October 2026</p>
        {children}
      </article>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        AMIGO on Cloudflare is a demo project built for a job application. It
        lets you create AI agents that run tasks for you. This page explains
        what data it uses and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          Your account (name and email) through Clerk, our sign-in provider.
        </li>
        <li>Your agents' settings, run results and memories.</li>
        <li>Login tokens for apps you connect (Google, Slack, Notion).</li>
      </ul>
      <p>
        Everything is stored in Cloudflare Durable Objects tied to your account,
        encrypted at rest by Cloudflare. Login tokens are never sent to your
        browser.
      </p>

      <h2>Google data</h2>
      <p>
        If you connect Google, AMIGO can read and send Gmail and create, read
        and edit Google Docs, but only when one of your agents runs a task you
        asked for. Google Docs access is limited to documents the app creates or
        you open with it.
      </p>
      <p>
        AMIGO's use of information received from Google APIs adheres to the{" "}
        <a
          className="text-orange-600 underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Google data is only used to
        perform the tasks you set up. It is not sold, not used for advertising,
        and not used to train AI models.
      </p>

      <h2>AI processing</h2>
      <p>
        Agent tasks are processed by Llama 3.3 on Cloudflare Workers AI. Content
        your agents read (for example an email they summarize) is sent to the
        model only to complete that task.
      </p>

      <h2>Deleting your data</h2>
      <ul>
        <li>Deleting an agent removes its settings, run history and memory.</li>
        <li>
          Disconnecting an app on the Integrations page removes its stored
          login.
        </li>
        <li>
          You can also revoke access at any time from your Google account's{" "}
          <a
            className="text-orange-600 underline"
            href="https://myaccount.google.com/permissions"
          >
            third-party access
          </a>{" "}
          page.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests:{" "}
        <a className="text-orange-600 underline" href={REPO_ISSUES}>
          open an issue on GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        AMIGO on Cloudflare is a free demo project made for a job application,
        provided as is, without any warranty or uptime guarantee.
      </p>
      <h2>Using the app</h2>
      <ul>
        <li>Use it only with accounts and data you're allowed to use.</li>
        <li>
          Agents act on your behalf. Review what you connect and what your
          agents are set to do.
        </li>
        <li>
          Don't use it to spam, harm others or break the terms of connected
          services.
        </li>
      </ul>
      <h2>Limits</h2>
      <p>
        The demo runs on Cloudflare's free plan, so daily AI usage is limited
        and features may stop working when limits are reached. Data may be reset
        or deleted at any time.
      </p>
      <h2>Contact</h2>
      <p>
        <a className="text-orange-600 underline" href={REPO_ISSUES}>
          Open an issue on GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}
