// Time zone helpers: schedules are written in local time but run in UTC.
import { describe, expect, it } from "vitest";
import {
  localCronToUtc,
  localDateTimeToUtc,
  tzOffsetMinutes
} from "@/lib/schedule";

// India and Japan don't use daylight saving, so these results never change.
describe("tzOffsetMinutes", () => {
  it("knows fixed offsets", () => {
    expect(tzOffsetMinutes("Asia/Kolkata")).toBe(330);
    expect(tzOffsetMinutes("Asia/Tokyo")).toBe(540);
    expect(tzOffsetMinutes("UTC")).toBe(0);
  });
});

describe("localCronToUtc", () => {
  it("shifts a fixed time into UTC", () => {
    expect(localCronToUtc("0 9 * * 1-5", "Asia/Kolkata")).toBe("30 3 * * 1-5");
  });

  it("moves the weekday back when UTC is the day before", () => {
    // 02:00 Monday in India is 20:30 Sunday in UTC.
    expect(localCronToUtc("0 2 * * 1", "Asia/Kolkata")).toBe("30 20 * * 0");
    // 08:00 Monday in Tokyo is 23:00 Sunday in UTC.
    expect(localCronToUtc("0 8 * * 1", "Asia/Tokyo")).toBe("0 23 * * 0");
  });

  it("wraps weekday lists across Sunday", () => {
    // 01:00 on Sunday and Monday in Tokyo -> Saturday and Sunday in UTC.
    expect(localCronToUtc("0 1 * * 0,1", "Asia/Tokyo")).toBe("0 16 * * 0,6");
  });

  it("leaves repeating patterns alone", () => {
    expect(localCronToUtc("*/15 * * * *", "Asia/Kolkata")).toBe("*/15 * * * *");
  });

  it("does nothing in UTC", () => {
    expect(localCronToUtc("30 18 * * 5", "UTC")).toBe("30 18 * * 5");
  });

  it("rejects broken cron strings", () => {
    expect(() => localCronToUtc("every day", "UTC")).toThrow();
  });
});

describe("localDateTimeToUtc", () => {
  it("converts a local date-time to UTC", () => {
    expect(
      localDateTimeToUtc("2026-10-02T09:30", "Asia/Kolkata").toISOString()
    ).toBe("2026-10-02T04:00:00.000Z");
  });

  it("rejects badly formatted dates", () => {
    expect(() => localDateTimeToUtc("tomorrow", "UTC")).toThrow();
  });
});
