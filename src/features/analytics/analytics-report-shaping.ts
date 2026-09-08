import {
  AnalyticsDataApiError,
  type AnalyticsReportResponse,
} from "./analytics-data-api";
import type {
  AnalyticsDataQualityNotice,
  AnalyticsDateRange,
  AnalyticsQuotaCategory,
  AnalyticsQuotaState,
} from "./types";

/**
 * The primitives every report module shares: relative date windows, strict
 * numeric parsing, row flattening, quota merging and GA4's data-quality
 * signals. They live apart from `analytics-reports.ts` because the funnel and
 * retention modules need them and must not import the composer that imports
 * them back.
 */

export const RANGE_DAYS: Record<AnalyticsDateRange, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

/**
 * The previous window ends the day before the current one starts, so the two
 * never share a day. `yesterday` rather than `today`: GA4's current day is
 * still filling up, and a half-day would read as a collapse.
 */
export function analyticsDateRange(
  range: AnalyticsDateRange,
  previous = false,
): { startDate: string; endDate: string } {
  const days = RANGE_DAYS[range];
  return previous
    ? { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }
    : { startDate: `${days}daysAgo`, endDate: "yesterday" };
}

export function assertFiniteNumericString(
  value: string | undefined,
): asserts value is string {
  const parsed =
    typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    throw new AnalyticsDataApiError(
      "invalid-response",
      "Google Analytics 응답에 올바르지 않은 숫자 값이 포함되어 있습니다.",
    );
  }
}

export function numericValue(value: string | undefined): number {
  assertFiniteNumericString(value);
  return Number(value);
}

export function firstMetric(
  report: AnalyticsReportResponse | undefined,
  metricName: string,
): number {
  if (!report) return 0;
  const metricIndex = report.metricHeaders.findIndex(
    ({ name }) => name === metricName,
  );
  if (metricIndex < 0) return 0;
  const row = report.rows[0] ?? report.totals[0];
  if (!row) return 0;
  return numericValue(row.metricValues[metricIndex]?.value);
}

export function reportRows(
  report: AnalyticsReportResponse,
): Array<Record<string, string>> {
  return report.rows.map((row) => {
    const output: Record<string, string> = {};
    report.dimensionHeaders.forEach(({ name }, index) => {
      output[name] = row.dimensionValues[index]?.value ?? "";
    });
    report.metricHeaders.forEach(({ name }, index) => {
      const value = row.metricValues[index]?.value;
      assertFiniteNumericString(value);
      output[name] = value;
    });
    return output;
  });
}

export function emptyReport(): AnalyticsReportResponse {
  return {
    dimensionHeaders: [],
    metricHeaders: [],
    rows: [],
    totals: [],
    rowCount: 0,
  };
}

export type AnalyticsReportScope = { key: string; title: string };

export type ReportQualityMetadata = {
  subjectToThresholding?: boolean;
  dataLossFromOtherRow?: boolean;
  samplingMetadatas?: ReadonlyArray<{
    samplesReadCount: string;
    samplingSpaceSize: string;
  }>;
};

export function dataQualityNoticesForReport(
  metadata: ReportQualityMetadata | undefined,
  scope: AnalyticsReportScope,
): AnalyticsDataQualityNotice[] {
  if (!metadata) return [];
  const reportScope = { reportKey: scope.key, reportTitle: scope.title };
  const notices: AnalyticsDataQualityNotice[] = [];

  if (metadata.subjectToThresholding === true) {
    notices.push({ ...reportScope, kind: "thresholding" });
  }
  for (const sampling of metadata.samplingMetadatas ?? []) {
    notices.push({
      ...reportScope,
      kind: "sampling",
      samplesReadCount: sampling.samplesReadCount,
      samplingSpaceSize: sampling.samplingSpaceSize,
    });
  }
  if (metadata.dataLossFromOtherRow === true) {
    notices.push({ ...reportScope, kind: "other-row" });
  }
  return notices;
}

export function dedupeDataQualityNotices(
  notices: readonly AnalyticsDataQualityNotice[],
): AnalyticsDataQualityNotice[] {
  const seen = new Set<string>();
  return notices.filter((notice) => {
    const key = JSON.stringify(notice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type QuotaCarrier = {
  propertyQuota?: Record<string, { consumed: number; remaining: number }>;
};

/**
 * Merges the quota snapshots of a batch pessimistically: the highest consumed
 * and the lowest remaining. An optimistic merge would tell an operator they
 * have room right before the next request fails.
 */
export function quotaFromReports(
  reports: readonly QuotaCarrier[],
  category: AnalyticsQuotaCategory,
): AnalyticsQuotaState | null {
  const byKey = new Map<string, { consumed: number; remaining: number }>();
  for (const report of reports) {
    for (const [key, entry] of Object.entries(report.propertyQuota ?? {})) {
      const existing = byKey.get(key);
      byKey.set(key, {
        consumed: Math.max(existing?.consumed ?? 0, entry.consumed),
        remaining: Math.min(
          existing?.remaining ?? Number.MAX_SAFE_INTEGER,
          entry.remaining,
        ),
      });
    }
  }
  if (byKey.size === 0) return null;
  return {
    category,
    entries: Array.from(byKey, ([key, entry]) => ({ key, ...entry })).sort(
      (a, b) => a.key.localeCompare(b.key),
    ),
  };
}

export function currencyFromReports(
  reports: readonly { metadata?: { currencyCode?: string } }[],
): string {
  return (
    reports.find((report) => report.metadata?.currencyCode)?.metadata
      ?.currencyCode ?? "KRW"
  );
}
