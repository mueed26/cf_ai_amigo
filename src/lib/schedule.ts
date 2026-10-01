// Time zone helpers. Schedules run in UTC, but users give times in their own time zone.

// How many minutes a time zone is ahead of UTC (India = 330).
export function tzOffsetMinutes(timezone: string, at = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// Turn a local date-time like "2026-10-02T09:30" into a UTC date.
export function localDateTimeToUtc(local: string, timezone: string): Date {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) throw new Error(`Invalid local datetime: ${local}`);
  const [, y, mo, d, h, mi] = match.map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(timezone, new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60_000);
}

const isInt = (field: string) => /^\d+$/.test(field);

// Convert a cron schedule from local time to UTC.
// Only fixed times (like "0 9 * * 1-5") need changing.
// Uses today's UTC offset, so re-save after daylight saving changes.
export function localCronToUtc(cron: string, timezone: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Invalid cron expression: ${cron}`);
  const [minute, hour, dom, month, dow] = fields;
  if (!isInt(minute) || !isInt(hour)) return fields.join(" ");

  const local = Number(hour) * 60 + Number(minute);
  const utc = local - tzOffsetMinutes(timezone);
  const dayShift = Math.floor(utc / 1440);
  const wrapped = ((utc % 1440) + 1440) % 1440;

  let utcDow = dow;
  if (dayShift !== 0 && dow !== "*") {
    utcDow = shiftDow(dow, dayShift);
  }
  // Day-of-month can't be shifted exactly; at worst it's off by one day.
  return [
    String(wrapped % 60),
    String(Math.floor(wrapped / 60)),
    dom,
    month,
    utcDow
  ].join(" ");
}

function shiftDow(dow: string, shift: number): string {
  const mod = (n: number) => (((n + shift) % 7) + 7) % 7;
  // Turn "1-5" or "1,3,5" into single days, then shift them.
  const days = new Set<number>();
  for (const part of dow.split(",")) {
    const range = part.match(/^(\d)-(\d)$/);
    if (range) {
      for (let d = Number(range[1]); d <= Number(range[2]); d++)
        days.add(mod(d % 7));
    } else if (isInt(part)) {
      days.add(mod(Number(part) % 7));
    } else {
      return dow; // step syntax etc. — leave untouched
    }
  }
  return [...days].sort((a, b) => a - b).join(",");
}
