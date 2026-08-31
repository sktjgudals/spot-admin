import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsReportResponse } from "./analytics-data-api";

vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return {
    ...actual,
    batchRunAnalyticsReports: vi.fn(),
    runAnalyticsRealtimeReport: vi.fn(),
  };
});

import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
  runAnalyticsRealtimeReport,
} from "./analytics-data-api";
import { fetchAnalyticsReport } from "./analytics-reports";

function report({
  dimensions = [],
  metrics = [],
  rows = [],
  currencyCode = "KRW",
  rowCount = rows.length,
  metadata = {},
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
  };
}

const baseInput = {
  property: { id: "1234", label: "Dopa", platform: "mixed" as const },
  range: "28d" as const,
  accessToken: "memory-token",
};

describe("fetchAnalyticsReport", () => {
  beforeEach(() => {
    vi.mocked(batchRunAnalyticsReports).mockReset();
    vi.mocked(runAnalyticsRealtimeReport).mockReset();
  });

  it("builds current, previous and trend reports for overview", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({
          metrics: [
            "activeUsers",
            "newUsers",
            "sessions",
            "engagementRate",
            "keyEvents",
            "totalRevenue",
          ],
          rows: [{ metrics: ["100", "40", "120", "0.5", "10", "30000"] }],
        }),
        report({
          metrics: [
            "activeUsers",
            "newUsers",
            "sessions",
            "engagementRate",
            "keyEvents",
            "totalRevenue",
          ],
          rows: [{ metrics: ["80", "30", "90", "0.4", "8", "25000"] }],
        }),
        report({
          dimensions: ["date"],
          metrics: ["sessions"],
          rows: [{ dimensions: ["20260830"], metrics: ["15"] }],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    expect(result.view).toBe("overview");
    if (result.view !== "overview") throw new Error("Expected overview result");
    expect(result.metrics[0]).toMatchObject({
      key: "activeUsers",
      value: 100,
      previousValue: 80,
    });
    expect(result.trend[0]).toMatchObject({ date: "20260830", sessions: "15" });
    expect(result.isEmpty).toBe(false);
    expect(batchRunAnalyticsReports).toHaveBeenCalledWith(
      "1234",
      expect.objectContaining({
        requests: expect.arrayContaining([
          expect.objectContaining({
            dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
          }),
          expect.objectContaining({
            dateRanges: [{ startDate: "56daysAgo", endDate: "29daysAgo" }],
          }),
        ]),
      }),
      expect.objectContaining({ accessToken: "memory-token" }),
    );
    expect(vi.mocked(batchRunAnalyticsReports).mock.calls[0]?.[1].requests[2]?.metrics).toEqual([
      { name: "sessions" },
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
    if (result.view === "overview") throw new Error("Expected table result");
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

    if (result.view === "overview") throw new Error("Expected table result");
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
    if (result.view === "overview") throw new Error("Expected realtime result");
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
        report({ metrics: ["activeUsers"], rows: [{ metrics: ["0"] }] }),
        report({ metrics: ["activeUsers"], rows: [{ metrics: ["0"] }] }),
        report({
          dimensions: ["date"],
          metrics: ["sessions"],
          rows: [{ dimensions: ["20260830"], metrics: ["0"] }],
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
          metrics: [
            "activeUsers",
            "newUsers",
            "sessions",
            "engagementRate",
            "keyEvents",
            "totalRevenue",
          ],
          rows: [{ metrics: ["not-a-number", "0", "0", "0", "0", "0"] }],
        }),
        report({
          metrics: [
            "activeUsers",
            "newUsers",
            "sessions",
            "engagementRate",
            "keyEvents",
            "totalRevenue",
          ],
          rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }],
        }),
        report({
          dimensions: ["date"],
          metrics: ["sessions"],
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
});
