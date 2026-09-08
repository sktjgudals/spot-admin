import { describe, expect, it } from "vitest";
import { AnalyticsDataApiError } from "./analytics-data-api";
import type { AnalyticsReportResponse } from "./analytics-data-api";
import {
  RANGE_DAYS,
  analyticsDateRange,
  currencyFromReports,
  dataQualityNoticesForReport,
  dedupeDataQualityNotices,
  emptyReport,
  firstMetric,
  numericValue,
  quotaFromReports,
  reportRows,
} from "./analytics-report-shaping";

function report(
  overrides: Partial<AnalyticsReportResponse> = {},
): AnalyticsReportResponse {
  return { ...emptyReport(), ...overrides };
}

describe("analyticsDateRange", () => {
  it("keeps the current and previous windows adjacent and non-overlapping", () => {
    expect(RANGE_DAYS).toEqual({ "7d": 7, "28d": 28, "90d": 90 });
    expect(analyticsDateRange("28d")).toEqual({
      startDate: "28daysAgo",
      endDate: "yesterday",
    });
    expect(analyticsDateRange("28d", true)).toEqual({
      startDate: "56daysAgo",
      endDate: "29daysAgo",
    });
  });
});

describe("numericValue", () => {
  it.each(["", " ", "not-a-number", "Infinity", undefined])(
    "refuses %p instead of presenting it as a real zero",
    (value) => {
      expect(() => numericValue(value)).toThrow(AnalyticsDataApiError);
      try {
        numericValue(value);
      } catch (reason) {
        expect((reason as AnalyticsDataApiError).kind).toBe("invalid-response");
      }
    },
  );

  it("accepts GA4's zero-padded and fractional strings", () => {
    expect(numericValue("0000")).toBe(0);
    expect(numericValue("0.412")).toBeCloseTo(0.412);
    expect(numericValue("-3")).toBe(-3);
  });
});

describe("reportRows", () => {
  it("flattens a row into one record keyed by header name", () => {
    const rows = reportRows(
      report({
        dimensionHeaders: [{ name: "date" }, { name: "dateRange" }],
        metricHeaders: [{ name: "sessions" }],
        rows: [
          {
            dimensionValues: [{ value: "20260901" }, { value: "current" }],
            metricValues: [{ value: "12" }],
          },
        ],
      }),
    );

    expect(rows).toEqual([
      { date: "20260901", dateRange: "current", sessions: "12" },
    ]);
  });
});

describe("firstMetric", () => {
  it("reads a named metric from the first row and falls back to totals", () => {
    const withRow = report({
      metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
      rows: [{ dimensionValues: [], metricValues: [{ value: "8" }, { value: "5" }] }],
    });
    const withTotalsOnly = report({
      metricHeaders: [{ name: "sessions" }],
      totals: [{ dimensionValues: [], metricValues: [{ value: "9" }] }],
    });

    expect(firstMetric(withRow, "activeUsers")).toBe(5);
    expect(firstMetric(withTotalsOnly, "sessions")).toBe(9);
    expect(firstMetric(withRow, "keyEvents")).toBe(0);
    expect(firstMetric(undefined, "sessions")).toBe(0);
  });
});

describe("quotaFromReports", () => {
  it("keeps the worst remaining figure per key and tags the pool", () => {
    const quota = quotaFromReports(
      [
        { propertyQuota: { tokensPerHour: { consumed: 10, remaining: 100 } } },
        {
          propertyQuota: {
            tokensPerHour: { consumed: 25, remaining: 40 },
            tokensPerDay: { consumed: 25, remaining: 900 },
          },
        },
      ],
      "funnel",
    );

    expect(quota).toEqual({
      category: "funnel",
      entries: [
        { key: "tokensPerDay", consumed: 25, remaining: 900 },
        { key: "tokensPerHour", consumed: 25, remaining: 40 },
      ],
    });
    expect(quotaFromReports([{}], "core")).toBeNull();
  });
});

describe("dataQualityNoticesForReport", () => {
  const scope = { key: "channels", title: "채널" };

  it("reports thresholding, sampling and (other)-row merging in that order", () => {
    expect(
      dataQualityNoticesForReport(
        {
          subjectToThresholding: true,
          dataLossFromOtherRow: true,
          samplingMetadatas: [
            { samplesReadCount: "12500", samplingSpaceSize: "50000" },
          ],
        },
        scope,
      ),
    ).toEqual([
      { kind: "thresholding", reportKey: "channels", reportTitle: "채널" },
      {
        kind: "sampling",
        reportKey: "channels",
        reportTitle: "채널",
        samplesReadCount: "12500",
        samplingSpaceSize: "50000",
      },
      { kind: "other-row", reportKey: "channels", reportTitle: "채널" },
    ]);
    expect(dataQualityNoticesForReport(undefined, scope)).toEqual([]);
  });

  it("collapses the identical notice repeated across paged responses", () => {
    const notice = {
      kind: "thresholding",
      reportKey: "channels",
      reportTitle: "채널",
    } as const;

    expect(dedupeDataQualityNotices([notice, { ...notice }])).toEqual([notice]);
  });
});

describe("currencyFromReports", () => {
  it("uses the first reported currency and defaults to KRW", () => {
    expect(
      currencyFromReports([{}, { metadata: { currencyCode: "USD" } }]),
    ).toBe("USD");
    expect(currencyFromReports([{}])).toBe("KRW");
  });
});
