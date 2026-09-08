import { describe, expect, it } from "vitest";
import { formatClockTime, formatDateTime, formatPartyDate, toDateTimeLocalInputValue } from "./format-date";

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
