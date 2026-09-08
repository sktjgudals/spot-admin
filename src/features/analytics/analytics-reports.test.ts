import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsReportResponse } from "./analytics-data-api";

vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return {
    ...actual,
    batchRunAnalyticsReports: vi.fn(),
    runAnalyticsRealtimeReport: vi.fn(),
    getAnalyticsMetadata: vi.fn(),
  };
});

vi.mock("./analytics-funnel", () => ({ fetchFunnel: vi.fn() }));
vi.mock("./analytics-retention", () => ({ fetchRetention: vi.fn() }));

import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
  getAnalyticsMetadata,
  runAnalyticsRealtimeReport,
} from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import { fetchFunnel } from "./analytics-funnel";
import { fetchRetention } from "./analytics-retention";
import {
  fetchAnalyticsCapabilities,
  fetchAnalyticsReport,
} from "./analytics-reports";

function report({
  dimensions = [],
  metrics = [],
  rows = [],
  currencyCode = "KRW",
  rowCount = rows.length,
  metadata = {},
  propertyQuota,
}: {
  dimensions?: string[];
  metrics?: string[];
  rows?: Array<{ dimensions?: string[]; metrics?: string[] }>;
  currencyCode?: string;
  rowCount?: number;
  metadata?: {
    subjectToThresholding?: boolean;
    dataLossFromOtherRow?: boolean;
    samplingMetadatas?: Array<{
      samplesReadCount: string;
      samplingSpaceSize: string;
    }>;
  };
  propertyQuota?: Record<string, { consumed: number; remaining: number }>;
}): AnalyticsReportResponse {
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name })),
    rows: rows.map((row) => ({
      dimensionValues: (row.dimensions ?? []).map((value) => ({ value })),
      metricValues: (row.metrics ?? []).map((value) => ({ value })),
    })),
    totals: [],
    rowCount,
    metadata: { currencyCode, timeZone: "Asia/Seoul", ...metadata },
    ...(propertyQuota ? { propertyQuota } : {}),
  };
}

const baseInput = {
  property: { id: "1234", label: "Dopa", platform: "mixed" as const },
  range: "28d" as const,
  filters: EMPTY_FILTERS,
  accessToken: "memory-token",
};

const OVERVIEW_SUMMARY_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "engagementRate",
  "keyEvents",
  "totalRevenue",
];

describe("fetchAnalyticsReport", () => {
  beforeEach(() => {
    vi.mocked(batchRunAnalyticsReports).mockReset();
    vi.mocked(runAnalyticsRealtimeReport).mockReset();
    vi.mocked(getAnalyticsMetadata).mockReset();
    vi.mocked(fetchFunnel).mockReset();
    vi.mocked(fetchRetention).mockReset();
  });

  it("compares two named ranges in one batch and derives series, platforms and insights", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["100", "40", "120", "0.5", "10", "30000"] }],
          propertyQuota: { tokensPerHour: { consumed: 10, remaining: 90 } },
        }),
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["80", "30", "90", "0.4", "8", "25000"] }],
        }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["20260901", "current"], metrics: ["10", "4", "12"] },
            { dimensions: ["20260903", "current"], metrics: ["20", "5", "22"] },
            { dimensions: ["20260804", "previous"], metrics: ["8", "3", "9"] },
            { dimensions: ["20260805", "previous"], metrics: ["9", "3", "10"] },
            { dimensions: ["20260806", "previous"], metrics: ["7", "2", "8"] },
          ],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["iOS", "current"], metrics: ["60", "20", "70"] },
            { dimensions: ["iOS", "previous"], metrics: ["50", "18", "60"] },
            { dimensions: ["Android", "current"], metrics: ["40", "20", "50"] },
            { dimensions: ["Android", "previous"], metrics: ["30", "12", "30"] },
          ],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    if (result.view !== "overview") throw new Error("Expected overview result");
    expect(result.metrics[0]).toMatchObject({
      key: "activeUsers",
      value: 100,
      previousValue: 80,
    });

    const requests = vi.mocked(batchRunAnalyticsReports).mock.calls[0]?.[1].requests;
    expect(requests).toHaveLength(4);
    expect(requests?.[0]?.dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday" },
    ]);
    expect(requests?.[1]?.dateRanges).toEqual([
      { startDate: "56daysAgo", endDate: "29daysAgo" },
    ]);
    expect(requests?.[2]?.dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday", name: "current" },
      { startDate: "56daysAgo", endDate: "29daysAgo", name: "previous" },
    ]);
    expect(requests?.[2]?.limit).toBe(56);
    expect(requests?.[3]?.dimensions).toEqual([{ name: "platform" }]);

    // A day GA4 never returned is a zero, not a hole — and its previous-period
    // partner still lines up by position.
    expect(result.series.points).toEqual([
      {
        date: "20260901",
        previousDate: "20260804",
        current: { activeUsers: 10, newUsers: 4, sessions: 12 },
        previous: { activeUsers: 8, newUsers: 3, sessions: 9 },
      },
      {
        date: "20260902",
        previousDate: "20260805",
        current: { activeUsers: 0, newUsers: 0, sessions: 0 },
        previous: { activeUsers: 9, newUsers: 3, sessions: 10 },
      },
      {
        date: "20260903",
        previousDate: "20260806",
        current: { activeUsers: 20, newUsers: 5, sessions: 22 },
        previous: { activeUsers: 7, newUsers: 2, sessions: 8 },
      },
    ]);

    expect(result.platforms).toEqual([
      {
        platform: "iOS",
        current: { activeUsers: 60, newUsers: 20, sessions: 70 },
        previous: { activeUsers: 50, newUsers: 18, sessions: 60 },
      },
      {
        platform: "Android",
        current: { activeUsers: 40, newUsers: 20, sessions: 50 },
        previous: { activeUsers: 30, newUsers: 12, sessions: 30 },
      },
    ]);

    expect(result.insights.map(({ id }) => id)).toEqual([
      "platform:Android",
      "total:sessions",
      "total:activeUsers",
      "total:totalRevenue",
      "total:engagementRate",
    ]);
    expect(result.quota?.category).toBe("core");
    expect(result.isEmpty).toBe(false);
  });

  it("reads GA4's positional date-range values as well as the names it was given", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["1", "1", "1", "0", "0", "0"] }] }),
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["1", "1", "1", "0", "0", "0"] }] }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["20260901", "date_range_0"], metrics: ["10", "4", "12"] },
            { dimensions: ["20260804", "date_range_1"], metrics: ["8", "3", "9"] },
            { dimensions: ["20260805", "somethingElse"], metrics: ["99", "99", "99"] },
          ],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    if (result.view !== "overview") throw new Error("Expected overview result");
    expect(result.series.points).toEqual([
      {
        date: "20260901",
        previousDate: "20260804",
        current: { activeUsers: 10, newUsers: 4, sessions: 12 },
        previous: { activeUsers: 8, newUsers: 3, sessions: 9 },
      },
    ]);
  });

  it.each([
    ["acquisition", ["sessionDefaultChannelGroup", "landingPagePlusQueryString"]],
    ["engagement", ["unifiedPageScreen", "eventName"]],
    ["conversion-revenue", ["eventName"]],
  ] as const)("builds the %s tables from its report definitions", async (view, dimensions) => {
    vi.mocked(batchRunAnalyticsReports).mockImplementation(async (_id, body) => ({
      reports: body.requests.map((request, index) =>
        report({
          dimensions: request.dimensions?.map(({ name }) => name) ?? [],
          metrics: request.metrics.map(({ name }) => name),
          rows: [
            {
              dimensions: (request.dimensions ?? []).map((_, itemIndex) =>
                itemIndex === 0 ? `row-${index}` : "value",
              ),
              metrics: request.metrics.map(() => "1"),
            },
          ],
        }),
      ),
    }));

    const result = await fetchAnalyticsReport({ ...baseInput, view });

    expect(result.view).toBe(view);
    if (result.view === "overview" || result.view === "funnel" || result.view === "retention") {
      throw new Error("Expected table result");
    }
    expect(result.tables.length).toBeGreaterThan(0);
    const requestedDimensions = vi
      .mocked(batchRunAnalyticsReports)
      .mock.calls[0]?.[1].requests.flatMap((request) =>
        (request.dimensions ?? []).map(({ name }) => name),
      );
    expect(requestedDimensions).toEqual(expect.arrayContaining([...dimensions]));
    expect(result.isEmpty).toBe(false);
  });

  it("preserves the total row count and report-scoped GA4 data-quality signals", async () => {
    vi.mocked(batchRunAnalyticsReports).mockImplementation(async (_id, body) => ({
      reports: body.requests.map((request, index) =>
        report({
          dimensions: request.dimensions?.map(({ name }) => name) ?? [],
          metrics: request.metrics.map(({ name }) => name),
          rows: [
            {
              dimensions: (request.dimensions ?? []).map(() => "value"),
              metrics: request.metrics.map(() => "1"),
            },
          ],
          rowCount: index === 0 ? 175 : 1,
          metadata:
            index === 0
              ? {
                  subjectToThresholding: true,
                  dataLossFromOtherRow: true,
                  samplingMetadatas: [
                    { samplesReadCount: "12500", samplingSpaceSize: "50000" },
                  ],
                }
              : {},
        }),
      ),
    }));

    const result = await fetchAnalyticsReport({ ...baseInput, view: "acquisition" });

    if (result.view === "overview" || result.view === "funnel" || result.view === "retention") {
      throw new Error("Expected table result");
    }
    expect(result.tables[0]).toMatchObject({
      key: "channels",
      totalRowCount: 175,
    });
    expect(result.dataQualityNotices).toEqual([
      {
        kind: "thresholding",
        reportKey: "channels",
        reportTitle: "채널·소스·캠페인",
      },
      {
        kind: "sampling",
        reportKey: "channels",
        reportTitle: "채널·소스·캠페인",
        samplesReadCount: "12500",
        samplingSpaceSize: "50000",
      },
      {
        kind: "other-row",
        reportKey: "channels",
        reportTitle: "채널·소스·캠페인",
      },
    ]);
  });

  it("loads realtime summary, screen, platform-stream and event reports", async () => {
    vi.mocked(runAnalyticsRealtimeReport)
      .mockResolvedValueOnce(
        report({ metrics: ["activeUsers"], rows: [{ metrics: ["9"] }] }),
      )
      .mockResolvedValueOnce(
        report({
          dimensions: ["unifiedScreenName"],
          metrics: ["activeUsers", "screenPageViews"],
          rows: [{ dimensions: ["홈"], metrics: ["5", "12"] }],
        }),
      )
      .mockResolvedValueOnce(
        report({
          dimensions: ["platform", "streamName"],
          metrics: ["activeUsers"],
          rows: [{ dimensions: ["web", "Dopa Web"], metrics: ["3"] }],
        }),
      )
      .mockResolvedValueOnce(
        report({
          dimensions: ["eventName"],
          metrics: ["eventCount", "keyEvents"],
          rows: [{ dimensions: ["screen_view"], metrics: ["20", "0"] }],
        }),
      );

    const result = await fetchAnalyticsReport({ ...baseInput, view: "realtime" });

    expect(result.view).toBe("realtime");
    if (result.view === "overview" || result.view === "funnel" || result.view === "retention") {
      throw new Error("Expected realtime result");
    }
    expect(result.metrics[0]).toMatchObject({ key: "activeUsers", value: 9 });
    expect(result.tables.map(({ key }) => key)).toEqual(["screens", "streams", "events"]);
    expect(runAnalyticsRealtimeReport).toHaveBeenCalledTimes(4);

    const supportedDimensions = [
      "appVersion",
      "city",
      "country",
      "deviceCategory",
      "eventName",
      "minutesAgo",
      "platform",
      "streamId",
      "streamName",
      "unifiedScreenName",
    ];
    const supportedMetrics = ["activeUsers", "eventCount", "keyEvents", "screenPageViews"];
    for (const [, request] of vi.mocked(runAnalyticsRealtimeReport).mock.calls) {
      expect((request.dimensions ?? []).map(({ name }) => name)).toEqual(
        expect.arrayContaining(
          (request.dimensions ?? [])
            .map(({ name }) => name)
            .filter((name) => supportedDimensions.includes(name)),
        ),
      );
      expect((request.dimensions ?? []).every(({ name }) => supportedDimensions.includes(name))).toBe(
        true,
      );
      expect(request.metrics.every(({ name }) => supportedMetrics.includes(name))).toBe(true);
    }
  });

  it("starts all independent realtime reports before waiting for a response", async () => {
    const resolvers: Array<(value: AnalyticsReportResponse) => void> = [];
    vi.mocked(runAnalyticsRealtimeReport).mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );

    const reportPromise = fetchAnalyticsReport({ ...baseInput, view: "realtime" });
    await Promise.resolve();

    expect(runAnalyticsRealtimeReport).toHaveBeenCalledTimes(4);
    resolvers.forEach((resolve) => resolve(report({ rows: [] })));
    await reportPromise;
  });

  it("marks a report with no rows and zero summary values as empty", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }] }),
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }] }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["20260830", "current"], metrics: ["0", "0", "0"] },
          ],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    expect(result.isEmpty).toBe(true);
  });

  it("rejects a malformed numeric metric instead of presenting it as a real zero", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["not-a-number", "0", "0", "0", "0", "0"] }],
        }),
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }],
        }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
      ],
    });

    await expect(
      fetchAnalyticsReport({ ...baseInput, view: "overview" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("rejects a malformed table metric instead of presenting it as a real zero", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({
          dimensions: [
            "sessionDefaultChannelGroup",
            "sessionSource",
            "sessionMedium",
            "sessionCampaignName",
          ],
          metrics: ["sessions", "engagedSessions", "keyEvents"],
          rows: [
            {
              dimensions: ["Organic Search", "google", "organic", "(not set)"],
              metrics: ["not-a-number", "3", "1"],
            },
          ],
        }),
        report({
          dimensions: ["landingPagePlusQueryString"],
          metrics: ["activeUsers", "sessions", "engagementRate", "keyEvents"],
          rows: [],
        }),
      ],
    });

    await expect(
      fetchAnalyticsReport({ ...baseInput, view: "acquisition" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("rejects a non-finite realtime table metric instead of presenting it as a real zero", async () => {
    vi.mocked(runAnalyticsRealtimeReport)
      .mockResolvedValueOnce(
        report({ metrics: ["activeUsers"], rows: [{ metrics: ["9"] }] }),
      )
      .mockResolvedValueOnce(
        report({
          dimensions: ["unifiedScreenName"],
          metrics: ["activeUsers", "screenPageViews"],
          rows: [{ dimensions: ["home"], metrics: ["Infinity", "12"] }],
        }),
      )
      .mockResolvedValueOnce(
        report({
          dimensions: ["platform", "streamName"],
          metrics: ["activeUsers"],
          rows: [],
        }),
      )
      .mockResolvedValueOnce(
        report({
          dimensions: ["eventName"],
          metrics: ["eventCount", "keyEvents"],
          rows: [],
        }),
      );

    await expect(
      fetchAnalyticsReport({ ...baseInput, view: "realtime" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("attaches the same dimension filter to every core request", async () => {
    vi.mocked(batchRunAnalyticsReports).mockImplementation(async (_id, body) => ({
      reports: body.requests.map((request) =>
        report({
          dimensions: request.dimensions?.map(({ name }) => name) ?? [],
          metrics: request.metrics.map(({ name }) => name),
          rows: [],
        }),
      ),
    }));

    await fetchAnalyticsReport({
      ...baseInput,
      view: "acquisition",
      filters: { platforms: ["iOS"], accountType: "business" },
    });

    const expected = {
      andGroup: {
        expressions: [
          { filter: { fieldName: "platform", inListFilter: { values: ["iOS"] } } },
          {
            filter: {
              fieldName: "customUser:account_type",
              stringFilter: { matchType: "EXACT", value: "business" },
            },
          },
        ],
      },
    };
    for (const request of vi.mocked(batchRunAnalyticsReports).mock.calls[0]?.[1]
      .requests ?? []) {
      expect(request.dimensionFilter).toEqual(expected);
    }
  });

  it("never filters the realtime reports", async () => {
    vi.mocked(runAnalyticsRealtimeReport).mockImplementation(async (_id, request) =>
      report({
        dimensions: request.dimensions?.map(({ name }) => name) ?? [],
        metrics: request.metrics.map(({ name }) => name),
        rows: [],
      }),
    );

    await fetchAnalyticsReport({
      ...baseInput,
      view: "realtime",
      filters: { platforms: ["Android"], accountType: "consumer" },
    });

    for (const [, request] of vi.mocked(runAnalyticsRealtimeReport).mock.calls) {
      expect(request).not.toHaveProperty("dimensionFilter");
    }
  });

  it("hands the funnel view to the funnel module with its preset and breakdown", async () => {
    vi.mocked(fetchFunnel).mockResolvedValue({
      view: "funnel",
      funnelId: "party-payment",
      title: "결제",
      description: "결제 화면 진입부터 승인까지의 단계별 이탈입니다.",
      steps: [],
      breakdown: null,
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: true,
    });

    const result = await fetchAnalyticsReport({
      ...baseInput,
      view: "funnel",
      funnelId: "party-payment",
      funnelBreakdown: true,
    });

    expect(result.view).toBe("funnel");
    expect(fetchFunnel).toHaveBeenCalledWith(
      expect.objectContaining({
        funnelId: "party-payment",
        breakdown: true,
        range: "28d",
        accessToken: "memory-token",
      }),
    );
    expect(batchRunAnalyticsReports).not.toHaveBeenCalled();
  });

  it("hands the retention view to the retention module and ignores the date range", async () => {
    vi.mocked(fetchRetention).mockResolvedValue({
      view: "retention",
      granularity: "WEEKLY",
      horizon: 4,
      cohorts: [],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: true,
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "retention" });

    expect(result.view).toBe("retention");
    const [call] = vi.mocked(fetchRetention).mock.calls;
    expect(call?.[0]).not.toHaveProperty("range");
    expect(call?.[0]).toMatchObject({ accessToken: "memory-token" });
  });

  it("asks the property whether account_type exists before offering the filter", async () => {
    vi.mocked(getAnalyticsMetadata).mockResolvedValue({
      dimensions: [
        { apiName: "platform" },
        { apiName: "customUser:account_type", customDefinition: true },
        { apiName: "customUser:dopa_uid", customDefinition: true },
      ],
      metrics: [],
    });

    await expect(
      fetchAnalyticsCapabilities({ propertyId: "1234", accessToken: "memory-token" }),
    ).resolves.toEqual({
      accountTypeDimension: true,
      customDimensions: ["customUser:account_type", "customUser:dopa_uid"],
    });

    vi.mocked(getAnalyticsMetadata).mockResolvedValue({
      dimensions: [{ apiName: "platform" }],
      metrics: [],
    });

    await expect(
      fetchAnalyticsCapabilities({ propertyId: "1234", accessToken: "memory-token" }),
    ).resolves.toEqual({ accountTypeDimension: false, customDimensions: [] });
  });
});
