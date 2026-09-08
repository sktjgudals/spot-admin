import {
  runAnalyticsReport,
  type AnalyticsDataApiOptions,
  type AnalyticsFilterExpression,
  type AnalyticsReportResponse,
  type AnalyticsRunReportRequest,
} from "./analytics-data-api";
import { buildDimensionFilter, type AnalyticsFilters } from "./analytics-filters";
import {
  currencyFromReports,
  dataQualityNoticesForReport,
  numericValue,
  quotaFromReports,
  reportRows,
} from "./analytics-report-shaping";
import type {
  AnalyticsPropertyConfig,
  AnalyticsRetentionCohort,
  AnalyticsRetentionResult,
} from "./types";

/**
 * Weekly retention by first-session week.
 *
 * Fixed at six cohorts and four follow-up weeks: 6 × 5 = 30 rows, one Core
 * request, and a matrix that still fits a laptop screen. The date selector is
 * disabled for this view because the cohorts define their own window.
 */

export const RETENTION_COHORT_COUNT = 6;
export const RETENTION_HORIZON = 4;

const DAY_MS = 86_400_000;

const RETENTION_SCOPE = { key: "retention", title: "주간 코호트 리텐션" };

export type RetentionCohortRange = {
  name: string;
  startDate: string;
  endDate: string;
};

function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * The operator's calendar day, read from local Y/M/D and then carried in UTC
 * purely as a day counter. Reading UTC fields directly would put an operator
 * in Seoul on yesterday's date for nine hours every morning.
 */
function startOfLocalDayUtc(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function retentionYesterday(now: Date): string {
  return isoDay(startOfLocalDayUtc(now) - DAY_MS);
}

export function buildWeeklyCohorts(
  now: Date,
  weeks = RETENTION_COHORT_COUNT,
): RetentionCohortRange[] {
  const yesterday = startOfLocalDayUtc(now) - DAY_MS;
  // GA4 weeks run Sunday–Saturday. Walk back to the last Saturday that is on
  // or before yesterday, so the newest cohort is a week that actually finished.
  const weekday = new Date(yesterday).getUTCDay();
  const lastSaturday = yesterday - ((weekday + 1) % 7) * DAY_MS;
  const latestStart = lastSaturday - 6 * DAY_MS;

  return Array.from({ length: weeks }, (_unused, index) => {
    const start = latestStart - (weeks - 1 - index) * 7 * DAY_MS;
    return {
      name: isoDay(start),
      startDate: isoDay(start),
      endDate: isoDay(start + 6 * DAY_MS),
    };
  });
}

export function buildRetentionRequest(
  cohorts: readonly RetentionCohortRange[],
  dimensionFilter?: AnalyticsFilterExpression,
): AnalyticsRunReportRequest {
  return {
    // No `dateRanges`: GA4 rejects a request that carries both a cohortSpec and
    // a top-level date range.
    dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metrics: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
    cohortSpec: {
      cohorts: cohorts.map(({ name, startDate, endDate }) => ({
        name,
        dimension: "firstSessionDate" as const,
        dateRange: { startDate, endDate },
      })),
      cohortsRange: {
        granularity: "WEEKLY" as const,
        startOffset: 0,
        endOffset: RETENTION_HORIZON,
      },
    },
    ...(dimensionFilter ? { dimensionFilter } : {}),
    limit: 100,
    returnPropertyQuota: true,
  };
}

function resolveCohortName(
  value: string,
  cohorts: readonly RetentionCohortRange[],
): string | null {
  if (cohorts.some((cohort) => cohort.name === value)) return value;
  // GA4 names unnamed cohorts by position. Accepting that form keeps the whole
  // matrix from blanking if the response ever comes back positional.
  const positional = /^cohort_(\d+)$/.exec(value);
  if (positional) return cohorts[Number(positional[1])]?.name ?? null;
  return null;
}

type RetentionCell = { active: number; total: number };

export function shapeRetention(
  report: AnalyticsReportResponse,
  cohorts: readonly RetentionCohortRange[],
  yesterday: string,
): AnalyticsRetentionCohort[] {
  const byCohort = new Map<string, Map<number, RetentionCell>>();
  for (const cohort of cohorts) {
    byCohort.set(cohort.name, new Map<number, RetentionCell>());
  }

  // GA4 returns cohort rows unordered and pads the week index ("0000").
  for (const row of reportRows(report)) {
    const name = resolveCohortName(row.cohort ?? "", cohorts);
    const cells = name === null ? undefined : byCohort.get(name);
    if (!cells) continue;
    cells.set(numericValue(row.cohortNthWeek), {
      active: numericValue(row.cohortActiveUsers),
      total: numericValue(row.cohortTotalUsers),
    });
  }

  const yesterdayMs = Date.parse(`${yesterday}T00:00:00.000Z`);
  return cohorts.map((cohort) => {
    const cells =
      byCohort.get(cohort.name) ?? new Map<number, RetentionCell>();
    const totalUsers = Math.max(
      0,
      ...Array.from(cells.values(), (cell) => cell.total),
    );
    const startMs = Date.parse(`${cohort.startDate}T00:00:00.000Z`);

    return {
      name: cohort.name,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      totalUsers,
      cells: Array.from({ length: RETENTION_HORIZON + 1 }, (_unused, week) => {
        const cell = cells.get(week);
        const activeUsers = cell?.active ?? 0;
        const weekStart = startMs + week * 7 * DAY_MS;
        const weekEnd = weekStart + 6 * DAY_MS;
        return {
          week,
          activeUsers,
          rate: totalUsers > 0 ? activeUsers / totalUsers : null,
          state:
            weekEnd <= yesterdayMs
              ? ("complete" as const)
              : weekStart <= yesterdayMs
                ? ("partial" as const)
                : ("future" as const),
        };
      }),
    };
  });
}

export type FetchRetentionInput = {
  property: AnalyticsPropertyConfig;
  filters: AnalyticsFilters;
  accessToken: string;
  /** Injectable so the cohort window is testable without touching the clock. */
  now?: Date;
  signal?: AbortSignal;
  fetchImpl?: AnalyticsDataApiOptions["fetchImpl"];
};

export async function fetchRetention(
  input: FetchRetentionInput,
): Promise<AnalyticsRetentionResult> {
  const now = input.now ?? new Date();
  const cohorts = buildWeeklyCohorts(now);
  const response = await runAnalyticsReport(
    input.property.id,
    buildRetentionRequest(cohorts, buildDimensionFilter(input.filters)),
    {
      accessToken: input.accessToken,
      signal: input.signal,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    },
  );

  const shaped = shapeRetention(response, cohorts, retentionYesterday(now));
  return {
    view: "retention",
    granularity: "WEEKLY",
    horizon: RETENTION_HORIZON,
    cohorts: shaped,
    currencyCode: currencyFromReports([response]),
    quota: quotaFromReports([response], "core"),
    dataQualityNotices: dataQualityNoticesForReport(
      response.metadata,
      RETENTION_SCOPE,
    ),
    isEmpty: shaped.every((cohort) => cohort.totalUsers === 0),
  };
}
