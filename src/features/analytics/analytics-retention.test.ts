import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return { ...actual, runAnalyticsReport: vi.fn() };
});

import { runAnalyticsReport, type AnalyticsReportResponse } from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import {
  RETENTION_HORIZON,
  buildRetentionRequest,
  buildWeeklyCohorts,
  fetchRetention,
  retentionYesterday,
  shapeRetention,
} from "./analytics-retention";

const property = { id: "5678", label: "Dopa App", platform: "mixed" as const };

/**
 * Built from local calendar components on purpose. The suite pins no TZ, and
 * `buildWeeklyCohorts` reads local Y/M/D, so an offset string like
 * "2026-09-08T03:00:00+09:00" would be a different calendar day outside KST.
 */
const NOW = new Date(2026, 8, 8, 12, 0, 0);

function retentionReport(
  rows: Array<{ cohort: string; week: string; active: string; total: string }>,
): AnalyticsReportResponse {
  return {
    dimensionHeaders: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metricHeaders: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
    rows: rows.map((row) => ({
      dimensionValues: [{ value: row.cohort }, { value: row.week }],
      metricValues: [{ value: row.active }, { value: row.total }],
    })),
    totals: [],
    rowCount: rows.length,
    metadata: { currencyCode: "KRW", timeZone: "Asia/Seoul" },
  };
}

describe("buildWeeklyCohorts", () => {
  it("takes the six complete Sunday–Saturday weeks ending on or before yesterday", () => {
    expect(buildWeeklyCohorts(NOW)).toEqual([
      { name: "2026-07-26", startDate: "2026-07-26", endDate: "2026-08-01" },
      { name: "2026-08-02", startDate: "2026-08-02", endDate: "2026-08-08" },
      { name: "2026-08-09", startDate: "2026-08-09", endDate: "2026-08-15" },
      { name: "2026-08-16", startDate: "2026-08-16", endDate: "2026-08-22" },
      { name: "2026-08-23", startDate: "2026-08-23", endDate: "2026-08-29" },
      { name: "2026-08-30", startDate: "2026-08-30", endDate: "2026-09-05" },
    ]);
    expect(retentionYesterday(NOW)).toBe("2026-09-07");
  });

  it("never includes the week that is still running", () => {
    // A Sunday: yesterday is the Saturday that just closed a week.
    const sunday = new Date(2026, 8, 6, 9, 0, 0);
    expect(buildWeeklyCohorts(sunday, 1)).toEqual([
      { name: "2026-08-30", startDate: "2026-08-30", endDate: "2026-09-05" },
    ]);
    // A Saturday: yesterday is Friday, so that week is incomplete.
    const saturday = new Date(2026, 8, 5, 9, 0, 0);
    expect(buildWeeklyCohorts(saturday, 1)).toEqual([
      { name: "2026-08-23", startDate: "2026-08-23", endDate: "2026-08-29" },
    ]);
  });
});

describe("buildRetentionRequest", () => {
  it("sends a cohortSpec and no top-level date range", () => {
    const request = buildRetentionRequest(buildWeeklyCohorts(NOW));

    expect(request.dateRanges).toBeUndefined();
    expect(request.dimensions).toEqual([
      { name: "cohort" },
      { name: "cohortNthWeek" },
    ]);
    expect(request.metrics).toEqual([
      { name: "cohortActiveUsers" },
      { name: "cohortTotalUsers" },
    ]);
    expect(request.cohortSpec?.cohortsRange).toEqual({
      granularity: "WEEKLY",
      startOffset: 0,
      endOffset: RETENTION_HORIZON,
    });
    expect(request.cohortSpec?.cohorts[0]).toEqual({
      name: "2026-07-26",
      dimension: "firstSessionDate",
      dateRange: { startDate: "2026-07-26", endDate: "2026-08-01" },
    });
    expect(request.cohortSpec?.cohorts).toHaveLength(6);
    expect(request.limit).toBe(100);
    expect(request.returnPropertyQuota).toBe(true);
    expect(request.dimensionFilter).toBeUndefined();
  });

  it("threads a dimension filter through unchanged", () => {
    const filter = {
      filter: {
        fieldName: "platform",
        inListFilter: { values: ["iOS"] },
      },
    } as const;

    expect(
      buildRetentionRequest(buildWeeklyCohorts(NOW), filter).dimensionFilter,
    ).toEqual(filter);
  });
});

describe("shapeRetention", () => {
  const cohorts = buildWeeklyCohorts(NOW);

  it("indexes unordered, zero-padded weeks and marks unfinished ones", () => {
    const shaped = shapeRetention(
      retentionReport([
        { cohort: "2026-08-30", week: "0001", active: "30", total: "120" },
        { cohort: "2026-08-30", week: "0000", active: "120", total: "120" },
        { cohort: "2026-07-26", week: "0000", active: "80", total: "80" },
        { cohort: "2026-07-26", week: "0004", active: "20", total: "80" },
      ]),
      cohorts,
      "2026-09-07",
    );

    const latest = shaped.at(-1);
    expect(latest?.name).toBe("2026-08-30");
    expect(latest?.totalUsers).toBe(120);
    expect(latest?.cells).toEqual([
      { week: 0, activeUsers: 120, rate: 1, state: "complete" },
      { week: 1, activeUsers: 30, rate: 0.25, state: "partial" },
      { week: 2, activeUsers: 0, rate: 0, state: "future" },
      { week: 3, activeUsers: 0, rate: 0, state: "future" },
      { week: 4, activeUsers: 0, rate: 0, state: "future" },
    ]);

    const oldest = shaped[0];
    expect(oldest?.cells.map(({ state }) => state)).toEqual([
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
    expect(oldest?.cells[4]).toMatchObject({ activeUsers: 20, rate: 0.25 });
  });

  it("leaves an empty cohort's rate null instead of drawing it as 0%", () => {
    const shaped = shapeRetention(retentionReport([]), cohorts, "2026-09-07");

    expect(shaped).toHaveLength(6);
    expect(shaped[0]?.totalUsers).toBe(0);
    expect(shaped[0]?.cells[0]?.rate).toBeNull();
  });

  it("accepts GA4's positional cohort names", () => {
    const shaped = shapeRetention(
      retentionReport([
        { cohort: "cohort_5", week: "0000", active: "10", total: "10" },
      ]),
      cohorts,
      "2026-09-07",
    );

    expect(shaped.at(-1)?.totalUsers).toBe(10);
  });
});

describe("fetchRetention", () => {
  beforeEach(() => {
    vi.mocked(runAnalyticsReport).mockReset();
  });

  it("issues exactly one core report and reports emptiness honestly", async () => {
    vi.mocked(runAnalyticsReport).mockResolvedValue({
      ...retentionReport([
        { cohort: "2026-08-30", week: "0000", active: "120", total: "120" },
      ]),
      propertyQuota: { tokensPerDay: { consumed: 40, remaining: 199_960 } },
    });

    const result = await fetchRetention({
      property,
      filters: EMPTY_FILTERS,
      accessToken: "memory-token",
      now: NOW,
    });

    expect(runAnalyticsReport).toHaveBeenCalledTimes(1);
    expect(result.view).toBe("retention");
    expect(result.granularity).toBe("WEEKLY");
    expect(result.horizon).toBe(4);
    expect(result.cohorts).toHaveLength(6);
    expect(result.quota?.category).toBe("core");
    expect(result.isEmpty).toBe(false);

    vi.mocked(runAnalyticsReport).mockResolvedValue(retentionReport([]));
    const empty = await fetchRetention({
      property,
      filters: EMPTY_FILTERS,
      accessToken: "memory-token",
      now: NOW,
    });
    expect(empty.isEmpty).toBe(true);
  });
});
