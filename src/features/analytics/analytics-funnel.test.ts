import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return { ...actual, runAnalyticsFunnelReport: vi.fn() };
});

import {
  AnalyticsDataApiError,
  runAnalyticsFunnelReport,
  type AnalyticsFunnelSubReport,
} from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import { FUNNEL_DEFINITIONS } from "./funnel-definitions";
import { fetchFunnel, shapeFunnel } from "./analytics-funnel";

const property = { id: "5678", label: "Dopa App", platform: "mixed" as const };

const FUNNEL_HEADERS = [
  { name: "activeUsers" },
  { name: "funnelStepCompletionRate" },
  { name: "funnelStepAbandonments" },
  { name: "funnelStepAbandonmentRate" },
];

function table(
  rows: Array<{ dimensions: string[]; metrics: string[] }>,
  breakdown = false,
  metadata?: AnalyticsFunnelSubReport["metadata"],
): AnalyticsFunnelSubReport {
  return {
    dimensionHeaders: breakdown
      ? [{ name: "funnelStepName" }, { name: "platform" }]
      : [{ name: "funnelStepName" }],
    metricHeaders: FUNNEL_HEADERS,
    rows: rows.map((row) => ({
      dimensionValues: row.dimensions.map((value) => ({ value })),
      metricValues: row.metrics.map((value) => ({ value })),
    })),
    ...(metadata ? { metadata } : {}),
  };
}

describe("shapeFunnel", () => {
  it("reads the API's ordinal prefix and leaves the last step's rates null", () => {
    const { steps, breakdown } = shapeFunnel(
      table([
        { dimensions: ["1. 파티 상세"], metrics: ["1000", "0.4", "600", "0.6"] },
        { dimensions: ["2. 신청 화면"], metrics: ["400", "0.25", "300", "0.75"] },
        { dimensions: ["3. 신청 완료"], metrics: ["100", "0", "0", "0"] },
      ]),
      FUNNEL_DEFINITIONS["party-apply"],
      false,
    );

    expect(breakdown).toBeNull();
    expect(steps).toEqual([
      {
        index: 0,
        name: "파티 상세",
        users: 1000,
        completionRate: 0.4,
        abandonments: 600,
        abandonmentRate: 0.6,
        shareOfFirst: 1,
      },
      {
        index: 1,
        name: "신청 화면",
        users: 400,
        completionRate: 0.25,
        abandonments: 300,
        abandonmentRate: 0.75,
        shareOfFirst: 0.4,
      },
      {
        index: 2,
        name: "신청 완료",
        users: 100,
        completionRate: null,
        abandonments: null,
        abandonmentRate: null,
        shareOfFirst: 0.1,
      },
    ]);
  });

  it("falls back to appearance order when GA4 sends no ordinal prefix", () => {
    const { steps } = shapeFunnel(
      table([
        { dimensions: ["파티 상세"], metrics: ["10", "0.5", "5", "0.5"] },
        { dimensions: ["신청 화면"], metrics: ["5", "0.4", "3", "0.6"] },
        { dimensions: ["신청 완료"], metrics: ["2", "0", "0", "0"] },
      ]),
      FUNNEL_DEFINITIONS["party-apply"],
      false,
    );

    expect(steps.map(({ users }) => users)).toEqual([10, 5, 2]);
  });

  it("treats RESERVED_TOTAL as the funnel and groups the rest by platform", () => {
    const { steps, breakdown } = shapeFunnel(
      table(
        [
          {
            dimensions: ["1. 파티 상세", "RESERVED_TOTAL"],
            metrics: ["1000", "0.4", "600", "0.6"],
          },
          { dimensions: ["1. 파티 상세", "iOS"], metrics: ["600", "0.5", "300", "0.5"] },
          {
            dimensions: ["1. 파티 상세", "Android"],
            metrics: ["400", "0.25", "300", "0.75"],
          },
          {
            dimensions: ["2. 신청 화면", "RESERVED_TOTAL"],
            metrics: ["400", "0.25", "300", "0.75"],
          },
          { dimensions: ["2. 신청 화면", "iOS"], metrics: ["300", "0.3", "210", "0.7"] },
          {
            dimensions: ["2. 신청 화면", "Android"],
            metrics: ["100", "0.1", "90", "0.9"],
          },
          {
            dimensions: ["3. 신청 완료", "RESERVED_TOTAL"],
            metrics: ["100", "0", "0", "0"],
          },
          { dimensions: ["3. 신청 완료", "iOS"], metrics: ["90", "0", "0", "0"] },
          { dimensions: ["3. 신청 완료", "Android"], metrics: ["10", "0", "0", "0"] },
        ],
        true,
      ),
      FUNNEL_DEFINITIONS["party-apply"],
      true,
    );

    expect(steps.map(({ users }) => users)).toEqual([1000, 400, 100]);
    expect(breakdown?.dimension).toBe("platform");
    expect(breakdown?.rows.map(({ value }) => value)).toEqual(["iOS", "Android"]);
    expect(breakdown?.rows[0]?.steps.map(({ users }) => users)).toEqual([600, 300, 90]);
    expect(breakdown?.rows[1]?.steps[2]?.shareOfFirst).toBeCloseTo(0.025);
  });

  it("refuses a non-numeric funnel metric rather than showing it as zero", () => {
    expect(() =>
      shapeFunnel(
        table([
          { dimensions: ["1. 파티 상세"], metrics: ["nope", "0", "0", "0"] },
        ]),
        FUNNEL_DEFINITIONS["party-apply"],
        false,
      ),
    ).toThrow(AnalyticsDataApiError);
  });
});

describe("fetchFunnel", () => {
  beforeEach(() => {
    vi.mocked(runAnalyticsFunnelReport).mockReset();
  });

  it("requests one funnel, tags the funnel quota pool and carries sampling notices", async () => {
    vi.mocked(runAnalyticsFunnelReport).mockResolvedValue({
      funnelTable: table(
        [
          { dimensions: ["1. 결제 화면"], metrics: ["50", "0.5", "25", "0.5"] },
          { dimensions: ["2. 결제 의도"], metrics: ["25", "0.4", "15", "0.6"] },
          { dimensions: ["3. 결제 승인"], metrics: ["10", "0", "0", "0"] },
        ],
        false,
        {
          samplingMetadatas: [
            { samplesReadCount: "1000", samplingSpaceSize: "4000" },
          ],
        },
      ),
      propertyQuota: { tokensPerHour: { consumed: 12, remaining: 39_988 } },
    });

    const result = await fetchFunnel({
      property,
      range: "28d",
      filters: EMPTY_FILTERS,
      funnelId: "party-payment",
      breakdown: false,
      accessToken: "memory-token",
    });

    expect(runAnalyticsFunnelReport).toHaveBeenCalledTimes(1);
    expect(runAnalyticsFunnelReport).toHaveBeenCalledWith(
      "5678",
      expect.objectContaining({
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      }),
      expect.objectContaining({ accessToken: "memory-token" }),
    );
    expect(result.view).toBe("funnel");
    expect(result.funnelId).toBe("party-payment");
    expect(result.title).toBe("결제");
    expect(result.quota?.category).toBe("funnel");
    expect(result.dataQualityNotices).toEqual([
      {
        kind: "sampling",
        reportKey: "funnel:party-payment",
        reportTitle: "결제",
        samplesReadCount: "1000",
        samplingSpaceSize: "4000",
      },
    ]);
    expect(result.isEmpty).toBe(false);
  });

  it("is empty only when every step has no users, and survives a missing quota", async () => {
    vi.mocked(runAnalyticsFunnelReport).mockResolvedValue({
      funnelTable: table([
        { dimensions: ["1. 파티 상세"], metrics: ["0", "0", "0", "0"] },
        { dimensions: ["2. 신청 화면"], metrics: ["0", "0", "0", "0"] },
        { dimensions: ["3. 신청 완료"], metrics: ["0", "0", "0", "0"] },
      ]),
    });

    const result = await fetchFunnel({
      property,
      range: "7d",
      filters: EMPTY_FILTERS,
      funnelId: "party-apply",
      breakdown: false,
      accessToken: "memory-token",
    });

    expect(result.isEmpty).toBe(true);
    expect(result.quota).toBeNull();
    expect(result.steps).toHaveLength(3);
  });
});
