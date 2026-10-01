/** Small shared UI helpers. */
import { useCallback, useState } from "react";
import { Badge, Button } from "@cloudflare/kumo";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import type { RunStatus } from "../shared";

export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  const toggle = useCallback(() => {
    const mode = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    try {
      localStorage.setItem("theme", mode);
    } catch {
      // storage unavailable — theme just won't persist
    }
  }, [dark]);
  return (
    <Button
      variant="ghost"
      shape="square"
      size="sm"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

export function RunStatusBadge({ status }: { status: RunStatus | null }) {
  if (!status) return <Badge variant="secondary">No runs yet</Badge>;
  const variant =
    status === "completed"
      ? "primary"
      : status === "failed"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export function formatDate(iso: string | null, timeZone?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000]
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return diff >= 0 ? "in a moment" : "just now";
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
