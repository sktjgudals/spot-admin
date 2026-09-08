import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatGaDate,
  formatMetric,
  formatPercentPoints,
  formatRate,
  formatSignificantPercent,
  percentChange,
} from "./analytics-format";

describe("formatMetric", () => {
  it.each([
    [1240, "integer", "1,240"],
    [0.512, "percent", "51.2%"],
    [30000, "currency", "₩30,000"],
    [95, "duration", "1.6분"],
    [7200, "duration", "2.0시간"],
    [45, "duration", "45초"],
  ] as const)("formats %p as %s", (value, format, expected) => {
    expect(formatMetric(value, format, "KRW")).toBe(expected);
  });

  it("falls back to a suffixed amount when the currency code is not a real one", () => {
    expect(formatMetric(1500, "currency", "NOT-A-CODE")).toBe("1,500 NOT-A-CODE");
  });

  it("never renders NaN or Infinity as a number", () => {
    expect(formatMetric(Number.NaN, "integer", "KRW")).toBe("0");
    expect(formatMetric(Number.POSITIVE_INFINITY, "integer", "KRW")).toBe("0");
  });
});

describe("percentChange", () => {
  it("returns null when there is nothing to compare against", () => {
    expect(percentChange(10, undefined)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
  });

  it("measures change against the magnitude of the previous value", () => {
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(80, 100)).toBeCloseTo(-20);
  });
});

describe("formatGaDate", () => {
  it("renders GA4's compact date and leaves anything else untouched", () => {
    expect(formatGaDate("20260830")).toBe("2026.08.30");
    expect(formatGaDate("(other)")).toBe("(other)");
  });
});

describe("percent helpers", () => {
  it.each([
    [0.412, "41.2%"],
    [1, "100.0%"],
    [0, "0.0%"],
  ] as const)("renders the fraction %p as %s", (rate, expected) => {
    expect(formatRate(rate)).toBe(expected);
  });

  it("marks an incomparable rate rather than printing a zero", () => {
    expect(formatRate(null)).toBe("—");
  });

  it.each([
    [32, "32%"],
    [-32, "32%"],
    [10, "10%"],
    [9.94, "9.9%"],
    [6.2, "6.2%"],
  ] as const)("drops the decimal on %p once it is 10 or more", (value, expected) => {
    expect(formatSignificantPercent(value)).toBe(expected);
  });

  it.each([
    [6.2, "6.2%p"],
    [-6.2, "6.2%p"],
    [12, "12%p"],
  ] as const)("renders %p as %s", (value, expected) => {
    expect(formatPercentPoints(value)).toBe(expected);
  });
});

describe("formatCount", () => {
  it("groups thousands the Korean way", () => {
    expect(formatCount(1240)).toBe("1,240");
    expect(formatCount(0)).toBe("0");
  });
});
