import { Info, TrendingUp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSignificantPercent } from "./analytics-format";
import type { AnalyticsInsight, AnalyticsInsightSeverity } from "./types";

/**
 * Severity is carried by a word as well as a colour and an icon. An operator
 * scanning this list on a projector, or with a colour-vision difference, still
 * reads which line is the alarm.
 */
const SEVERITY: Record<
  AnalyticsInsightSeverity,
  { label: string; icon: typeof Info; className: string }
> = {
  warning: {
    label: "주의",
    icon: TriangleAlert,
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
  },
  positive: {
    label: "긍정",
    icon: TrendingUp,
    className: "border-success/40 bg-success/10 text-success",
  },
  info: {
    label: "참고",
    icon: Info,
    className: "border-info/40 bg-info/10 text-info",
  },
};

const HEADING_ID = "analytics-insights-title";

export function InsightsPanel({ insights }: { insights: AnalyticsInsight[] }) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="rounded-xl border bg-card p-4"
    >
      <h2 id={HEADING_ID} className="font-semibold">
        인사이트 요약
      </h2>
      {insights.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          이전 기간 대비 눈에 띄는 변화가 없습니다.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {insights.map((insight) => {
            const severity = SEVERITY[insight.severity];
            const Icon = severity.icon;
            return (
              <li key={insight.id} className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                    severity.className,
                  )}
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {severity.label}
                </span>
                <span className="text-sm leading-6">{insight.text}</span>
                {insight.delta === null ? null : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {insight.delta < 0 ? "−" : "+"}
                    {formatSignificantPercent(insight.delta)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
