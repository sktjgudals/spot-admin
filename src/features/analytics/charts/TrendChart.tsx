"use client";

import { useState } from "react";
import { formatCount, formatGaDate } from "../analytics-format";
import type { AnalyticsTrendMetric, AnalyticsTrendSeries } from "../types";

/**
 * A dependency-free line chart.
 *
 * `recharts` is on the repo's "stays deleted" list
 * (scripts/test-production-hardening.mjs), and a charting library is a large
 * dependency for two polylines. The SVG is drawn from a fixed `viewBox`, so it
 * needs no layout measurement and renders identically in jsdom and a browser.
 *
 * The picture is decoration: every point is also in the sr-only table, which
 * is the accessible reading of this figure.
 */

const TREND_METRIC_LABELS: Record<AnalyticsTrendMetric, string> = {
  activeUsers: "활성 사용자",
  newUsers: "신규 사용자",
  sessions: "세션",
};

const VIEW_HEIGHT = 256;
const PADDING = { top: 16, right: 12, bottom: 28, left: 52 };

export type TrendChartProps = {
  series: AnalyticsTrendSeries;
  metric: AnalyticsTrendMetric;
  showPrevious: boolean;
  width?: number;
};

export default function TrendChart({
  series,
  metric,
  showPrevious,
  width = 720,
}: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const points = series.points;
  const label = TREND_METRIC_LABELS[metric];

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        표시할 일별 데이터가 없습니다.
      </p>
    );
  }

  const currentValues = points.map((point) => point.current[metric]);
  const previousValues = points.map((point) => point.previous?.[metric] ?? 0);
  const maxValue = Math.max(
    1,
    ...currentValues,
    ...(showPrevious ? previousValues : []),
  );
  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const bandWidth = plotWidth / Math.max(1, points.length);

  const xAt = (index: number) =>
    points.length <= 1
      ? PADDING.left + plotWidth / 2
      : PADDING.left + (index / (points.length - 1)) * plotWidth;
  const yAt = (value: number) =>
    PADDING.top + plotHeight - (value / maxValue) * plotHeight;
  const pathOf = (values: readonly number[]) =>
    values
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`,
      )
      .join(" ");

  const hoveredPoint = hovered === null ? null : points[hovered];

  return (
    <figure aria-label={`일별 추세: ${label}`} className="m-0 space-y-2">
      <svg
        viewBox={`0 0 ${width} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="presentation"
        aria-hidden="true"
        className="h-64 w-full rounded-lg bg-muted/30"
      >
        <line
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={width - PADDING.right}
          y2={PADDING.top + plotHeight}
          className="stroke-border"
          strokeWidth={1}
        />
        <text
          x={PADDING.left - 8}
          y={PADDING.top + 4}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          {formatCount(maxValue)}
        </text>
        <text
          x={PADDING.left - 8}
          y={PADDING.top + plotHeight}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          0
        </text>

        {showPrevious ? (
          <path
            d={pathOf(previousValues)}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        ) : null}
        <path
          d={pathOf(currentValues)}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2}
        />

        {points.map((point, index) => (
          <rect
            key={point.date}
            data-point={index}
            x={xAt(index) - bandWidth / 2}
            y={PADDING.top}
            width={bandWidth}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        <text
          x={PADDING.left}
          y={VIEW_HEIGHT - 8}
          className="fill-muted-foreground text-xs"
        >
          {formatGaDate(points[0]?.date ?? "")}
        </text>
        <text
          x={width - PADDING.right}
          y={VIEW_HEIGHT - 8}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          {formatGaDate(points.at(-1)?.date ?? "")}
        </text>
      </svg>

      {hoveredPoint ? (
        <p
          data-testid="trend-tooltip"
          className="rounded-lg border bg-card px-3 py-2 text-xs tabular-nums text-foreground"
        >
          {formatGaDate(hoveredPoint.date)} · {label}{" "}
          {formatCount(hoveredPoint.current[metric])}
          {showPrevious
            ? ` · 이전 기간 ${
                hoveredPoint.previous
                  ? formatCount(hoveredPoint.previous[metric])
                  : "—"
              }`
            : ""}
        </p>
      ) : null}

      <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
          </svg>
          이번 기간
        </span>
        {showPrevious ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            </svg>
            이전 기간
          </span>
        ) : null}
      </p>

      <table className="sr-only">
        <caption>{`일별 추세: ${label}`}</caption>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">{label}</th>
            {showPrevious ? <th scope="col">이전 기간</th> : null}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{formatGaDate(point.date)}</th>
              <td>{formatCount(point.current[metric])}</td>
              {showPrevious ? (
                <td>
                  {point.previousDate ? `${formatGaDate(point.previousDate)} ` : ""}
                  {point.previous ? formatCount(point.previous[metric]) : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
