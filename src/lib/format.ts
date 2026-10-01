// Small date and text helpers for the UI.
import { toast } from "@/components/ui/toast";

// "3 minutes ago", "in 2 hours"
export function fromNow(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000]
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return diff >= 0 ? "in a moment" : "just now";
}

// "Oct 2, 2026, 9:00 AM"
export function formatDate(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// Show an error toast from any thrown value.
export function toastError(e: unknown, title = "Something went wrong") {
  toast.add({ type: "error", title, description: errorText(e) });
}

export function toastSuccess(title: string, description?: string) {
  toast.add({ type: "success", title, description });
}

// Fallback avatar for agents created before avatars existed.
export function agentImage(image: string | null | undefined, name: string) {
  return (
    image ||
    `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}`
  );
}
