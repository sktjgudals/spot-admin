import { describe, expect, it } from "vitest";
import {
  formatClockTime,
  formatDateOnly,
  formatDateTime,
  formatDayLabel,
  formatPartyDate,
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
