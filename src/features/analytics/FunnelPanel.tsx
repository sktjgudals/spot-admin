"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCount, formatRate } from "./analytics-format";
import {
  FUNNEL_DEFINITIONS,
  FUNNEL_IDS,
  type FunnelId,
} from "./funnel-definitions";
import type { AnalyticsFunnelResult, AnalyticsFunnelStepResult } from "./types";

/** The funnel itself is `--chart-1`; breakdown rows cycle through the rest. */
const BREAKDOWN_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export type FunnelPanelProps = {
  result: AnalyticsFunnelResult;
  funnelId: FunnelId;
  onFunnelIdChange: (funnelId: FunnelId) => void;
  breakdown: boolean;
  onBreakdownChange: (breakdown: boolean) => void;
};

export function FunnelPanel({
  result,
  funnelId,
  onFunnelIdChange,
  breakdown,
  onBreakdownChange,
}: FunnelPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{result.title}</CardTitle>
        <CardDescription className="mt-1">{result.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            퍼널
            <select
              aria-label="퍼널"
              className="h-9 min-w-40 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
              value={funnelId}
              onChange={(event) => onFunnelIdChange(event.target.value as FunnelId)}
            >
              {FUNNEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {FUNNEL_DEFINITIONS[id].title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={breakdown}
              onChange={(event) => onBreakdownChange(event.target.checked)}
            />
            플랫폼별 보기
          </label>
        </div>

        {result.isEmpty ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
            선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을
            확인해 주세요.
          </p>
        ) : (
          <ol className="space-y-5">
            {result.steps.map((step) => (
              <li key={step.index} className="space-y-2">
                <FunnelStepRow step={step} color="var(--chart-1)" />
                {breakdown && result.breakdown ? (
                  <ul className="space-y-2 border-l pl-4">
                    {result.breakdown.rows.map((row, rowIndex) => {
                      const rowStep = row.steps[step.index];
                      if (!rowStep) return null;
                      return (
                        <li key={row.value}>
                          <FunnelStepRow
                            step={rowStep}
                            label={row.value}
                            color={
                              BREAKDOWN_COLORS[rowIndex % BREAKDOWN_COLORS.length]
                            }
                            compact
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelStepRow({
  step,
  color,
  label,
  compact = false,
}: {
  step: AnalyticsFunnelStepResult;
  color: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={compact ? "text-sm text-muted-foreground" : "font-medium"}>
          {label ?? `${step.index + 1}. ${step.name}`}
        </p>
        <p className="text-sm font-medium tabular-nums">
          {formatCount(step.users)}명
        </p>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          aria-hidden="true"
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, step.shareOfFirst * 100)).toFixed(1)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <p className="text-xs leading-5 tabular-nums text-muted-foreground">
        {step.completionRate === null
          ? "마지막 단계"
          : `다음 단계 전환 ${formatRate(step.completionRate)}`}
        {step.abandonments === null
          ? null
          : ` · 이탈 ${formatCount(step.abandonments)}명 (${formatRate(step.abandonmentRate)})`}
      </p>
    </div>
  );
}
