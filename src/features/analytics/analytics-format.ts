import type { AnalyticsMetricValue } from "./types";

/**
 * One place where a GA4 number becomes Korean text.
 *
 * Percentages are shown to one decimal below 10 and as whole numbers above it:
 * "9.9%" carries information, "32.4%" only carries noise into a summary
 * sentence an operator reads at a glance.
 */

const INTEGER_FORMAT = new Intl.NumberFormat("ko-KR");

export function formatCount(value: number): string {
  return INTEGER_FORMAT.format(Number.isFinite(value) ? Math.round(value) : 0);
}

export function formatMetric(
  value: number,
  format: AnalyticsMetricValue["format"],
  currencyCode: string,
): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (format === "percent") {
    return new Intl.NumberFormat("ko-KR", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(safeValue);
  }
  if (format === "currency") {
    try {
      return new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(safeValue);
    } catch {
      return `${safeValue.toLocaleString("ko-KR")} ${currencyCode}`;
    }
  }
  if (format === "duration") {
    if (safeValue >= 3600) return `${(safeValue / 3600).toFixed(1)}시간`;
    if (safeValue >= 60) return `${(safeValue / 60).toFixed(1)}분`;
    return `${Math.round(safeValue).toLocaleString("ko-KR")}초`;
  }
  return formatCount(safeValue);
}

export function percentChange(
  value: number,
  previous: number | undefined,
): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * 100;
}

export function formatGaDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

/** GA4 rates are fractions: 0.412 is 41.2 %. */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatSignificantPercent(value: number): string {
  const magnitude = Math.abs(Number.isFinite(value) ? value : 0);
  return magnitude >= 10
    ? `${Math.round(magnitude)}%`
    : `${magnitude.toFixed(1)}%`;
}

export function formatPercentPoints(value: number): string {
  const magnitude = Math.abs(Number.isFinite(value) ? value : 0);
  return magnitude >= 10
    ? `${Math.round(magnitude)}%p`
    : `${magnitude.toFixed(1)}%p`;
}
