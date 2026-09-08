import { describe, expect, it } from "vitest";
import {
  formatClockTime,
  formatDateOnly,
  formatDateTime,
  formatDayLabel,
  formatPartyDate,
  toDateTimeLocalInputValue,
} from "./format-date";

describe("format-date", () => {
  it("renders a UTC instant in Asia/Seoul", () => {
    const instant = "2026-08-21T00:00:00.000Z";
    expect(formatDateTime(instant)).toMatch(/2026/);
    expect(formatDateTime(instant)).toMatch(/9/);
    expect(formatPartyDate(instant)).toMatch(/21/);
    expect(formatClockTime(instant)).toMatch(/9/);
  });

  it("returns a dash for invalid values", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("labels a Seoul day and a Seoul date without leaking the runtime zone", () => {
    // 23:59 KST on the 7th and 00:01 KST on the 8th are different days.
    expect(formatDayLabel("2026-09-07T14:59:00.000Z")).toContain("7");
    expect(formatDayLabel("2026-09-07T15:01:00.000Z")).toContain("8");
    expect(formatDayLabel("2026-09-07T15:01:00.000Z")).toMatch(/2026/);
    expect(formatDateOnly("2026-09-07T15:01:00.000Z")).toMatch(/2026/);
    expect(formatDayLabel("not-a-date")).toBe("—");
    expect(formatDateOnly("not-a-date")).toBe("—");
  });
});

describe("toDateTimeLocalInputValue", () => {
  it("renders an ISO instant as the browser-local datetime-local value", () => {
    const local = new Date(2026, 8, 10, 12, 30); // 2026-09-10 12:30 in the test runner's zone
    expect(toDateTimeLocalInputValue(local.toISOString())).toBe("2026-09-10T12:30");
  });

  it("renders an epoch-ms number as the browser-local datetime-local value", () => {
    // The backend stores starts_at/ends_at as epoch-ms INTEGER; the projection
    // returns it as a number, not an ISO string.
    const local = new Date(2026, 8, 10, 12, 30);
    expect(toDateTimeLocalInputValue(local.getTime())).toBe("2026-09-10T12:30");
  });

  it("passes an already-local datetime-local string through unchanged", () => {
    expect(toDateTimeLocalInputValue("2026-09-10T12:30")).toBe("2026-09-10T12:30");
  });

  it("returns an empty string for empty, null and invalid input", () => {
    expect(toDateTimeLocalInputValue("")).toBe("");
    expect(toDateTimeLocalInputValue(null)).toBe("");
    expect(toDateTimeLocalInputValue("not a date")).toBe("");
    expect(toDateTimeLocalInputValue(true)).toBe("");
  });
});
