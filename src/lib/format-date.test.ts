import { describe, expect, it } from "vitest";
import { formatClockTime, formatDateTime, formatPartyDate } from "./format-date";

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
