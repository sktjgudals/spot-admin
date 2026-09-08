import { normalizePlatform } from "./analytics-filters";
import {
  formatCount,
  formatMetric,
  formatPercentPoints,
  formatSignificantPercent,
  percentChange,
} from "./analytics-format";
import type {
  AnalyticsInsight,
  AnalyticsInsightSeverity,
  AnalyticsMetricValue,
  AnalyticsPlatformBreakdown,
} from "./types";

/**
 * Sentences an operator can act on, computed from the overview numbers already
 * fetched — no extra GA4 request.
 *
 * The thresholds exist to stop the panel from crying wolf: a 40 % swing on 12
 * users is noise, and a screen that says so every morning gets ignored on the
 * morning it matters.
 */
export const DEFAULT_INSIGHT_THRESHOLDS = {
  totalDeltaPercent: 20,
  totalBaseUsers: 50,
  revenueBase: 1,
  engagementPointDelta: 5,
  platformDeltaPercent: 25,
  platformBaseUsers: 30,
  shareShiftPoints: 10,
  maxInsights: 5,
} as const;

export type InsightThresholds = typeof DEFAULT_INSIGHT_THRESHOLDS;

const COUNT_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "keyEvents",
] as const;

const SEVERITY_ORDER: Record<AnalyticsInsightSeverity, number> = {
  warning: 0,
  positive: 1,
  info: 2,
};

export type BuildInsightsInput = {
  metrics: readonly AnalyticsMetricValue[];
  platforms: readonly AnalyticsPlatformBreakdown[];
  currencyCode: string;
};

export function buildInsights(
  input: BuildInsightsInput,
  thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const byKey = new Map(input.metrics.map((metric) => [metric.key, metric]));

  for (const key of COUNT_METRICS) {
    const metric = byKey.get(key);
    if (!metric || metric.previousValue === undefined) continue;
    if (metric.previousValue < thresholds.totalBaseUsers) continue;
    const delta = percentChange(metric.value, metric.previousValue);
    if (delta === null || Math.abs(delta) < thresholds.totalDeltaPercent) continue;

    insights.push({
      id: `total:${key}`,
      severity: delta < 0 ? "warning" : "positive",
      text: `${metric.label} ${formatSignificantPercent(delta)} ${
        delta < 0 ? "감소" : "증가"
      } (${formatCount(metric.previousValue)} → ${formatCount(metric.value)})`,
      metric: key,
      scope: "total",
      delta,
      current: metric.value,
      previous: metric.previousValue,
    });
  }

  const engagement = byKey.get("engagementRate");
  if (engagement && engagement.previousValue !== undefined) {
    // GA4 reports the rate as a fraction. Rounding to a tenth of a point first
    // keeps 0.574 → 0.512 from landing at 6.199999999999994 and, worse, keeps a
    // clean −5.0 from falling just under the threshold.
    const points =
      Math.round((engagement.value - engagement.previousValue) * 1_000) / 10;
    if (Math.abs(points) >= thresholds.engagementPointDelta) {
      insights.push({
        id: "total:engagementRate",
        severity: points < 0 ? "warning" : "positive",
        text: `${engagement.label} ${formatPercentPoints(points)} ${
          points < 0 ? "하락" : "상승"
        }`,
        metric: "engagementRate",
        scope: "total",
        delta: points,
        current: engagement.value,
        previous: engagement.previousValue,
      });
    }
  }

  const revenue = byKey.get("totalRevenue");
  if (
    revenue &&
    revenue.previousValue !== undefined &&
    revenue.previousValue >= thresholds.revenueBase
  ) {
    const delta = percentChange(revenue.value, revenue.previousValue);
    if (delta !== null && Math.abs(delta) >= thresholds.totalDeltaPercent) {
      insights.push({
        id: "total:totalRevenue",
        severity: delta < 0 ? "warning" : "positive",
        text: `${revenue.label} ${formatSignificantPercent(delta)} ${
          delta < 0 ? "감소" : "증가"
        } (${formatMetric(revenue.previousValue, "currency", input.currencyCode)} → ${formatMetric(
          revenue.value,
          "currency",
          input.currencyCode,
        )})`,
        metric: "totalRevenue",
        scope: "total",
        delta,
        current: revenue.value,
        previous: revenue.previousValue,
      });
    }
  }

  for (const row of input.platforms) {
    const previous = row.previous.activeUsers;
    if (previous < thresholds.platformBaseUsers) continue;
    const delta = percentChange(row.current.activeUsers, previous);
    if (delta === null || Math.abs(delta) < thresholds.platformDeltaPercent) {
      continue;
    }
    const label = normalizePlatform(row.platform);
    insights.push({
      id: `platform:${label}`,
      severity: delta < 0 ? "warning" : "positive",
      text: `${label} 유입 ${delta < 0 ? "급감" : "급증"} ${formatSignificantPercent(
        delta,
      )} (활성 사용자 ${formatCount(previous)} → ${formatCount(row.current.activeUsers)})`,
      metric: "activeUsers",
      scope: "platform",
      delta,
      current: row.current.activeUsers,
      previous,
    });
  }

  const currentTotal = input.platforms.reduce(
    (sum, row) => sum + row.current.activeUsers,
    0,
  );
  const previousTotal = input.platforms.reduce(
    (sum, row) => sum + row.previous.activeUsers,
    0,
  );
  if (currentTotal > 0 && previousTotal > 0) {
    for (const row of input.platforms) {
      const currentShare = (row.current.activeUsers / currentTotal) * 100;
      const previousShare = (row.previous.activeUsers / previousTotal) * 100;
      const shift = currentShare - previousShare;
      if (Math.abs(shift) < thresholds.shareShiftPoints) continue;
      const label = normalizePlatform(row.platform);
      insights.push({
        id: `share:${label}`,
        // A mix shift is context, not an alarm: the total may be unchanged.
        severity: "info",
        text: `${label} 비중 ${Math.round(previousShare)}% → ${Math.round(
          currentShare,
        )}%`,
        metric: "activeUsersShare",
        scope: "platform",
        delta: shift,
        current: currentShare,
        previous: previousShare,
      });
    }
  }

  if (insights.length === 0) {
    const activeUsers = byKey.get("activeUsers");
    const previous = activeUsers?.previousValue ?? 0;
    // Silence has two meanings. Say which one this is.
    if (previous < thresholds.totalBaseUsers) {
      return [
        {
          id: "info:small-base",
          severity: "info",
          text: "비교 기준이 작아 유의미한 변화를 판단하지 않았습니다.",
          metric: "activeUsers",
          scope: "total",
          delta: null,
          current: activeUsers?.value ?? 0,
          previous,
        },
      ];
    }
    return [];
  }

  return insights
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) ||
        a.metric.localeCompare(b.metric) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, thresholds.maxInsights);
}
