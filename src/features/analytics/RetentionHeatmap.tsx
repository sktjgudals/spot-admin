import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatRate } from "./analytics-format";
import type {
  AnalyticsRetentionCell,
  AnalyticsRetentionResult,
} from "./types";

/**
 * Colour grades the cell, the printed rate states it. A heatmap that says
 * "this square is darker" and nothing else is unreadable to a fifth of
 * operators and unquotable in a report by all of them.
 */
const CELL_ALPHA = [0.06, 0.24, 0.42, 0.6, 0.78];

function intensityOf(cell: AnalyticsRetentionCell | undefined): number {
  if (!cell || cell.state === "future" || cell.rate === null) return 0;
  if (cell.rate >= 0.4) return 4;
  if (cell.rate >= 0.25) return 3;
  if (cell.rate >= 0.15) return 2;
  if (cell.rate >= 0.05) return 1;
  return 0;
}

function cellText(cell: AnalyticsRetentionCell | undefined): string {
  if (!cell || cell.state === "future" || cell.rate === null) return "—";
  return `${formatRate(cell.rate)}${cell.state === "partial" ? "†" : ""}`;
}

export function RetentionHeatmap({
  result,
}: {
  result: AnalyticsRetentionResult;
}) {
  // Week 0 is every cohort's own definition — always 100 %. It stays in the
  // data (the API returned it) but adding a column of "100.0%" teaches nothing.
  const weeks = Array.from({ length: result.horizon }, (_unused, i) => i + 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>주간 코호트 리텐션</CardTitle>
        <CardDescription className="mt-1">
          첫 세션 주 기준 주간 코호트 · GA4 firstSessionDate
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">주간 코호트 리텐션</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>코호트 시작일</TableHead>
                <TableHead className="text-right">크기</TableHead>
                {weeks.map((week) => (
                  <TableHead key={week} className="text-right">
                    {week}주
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.cohorts.map((cohort) => (
                <TableRow key={cohort.name}>
                  <TableCell className="tabular-nums">{cohort.startDate}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCount(cohort.totalUsers)}
                  </TableCell>
                  {weeks.map((week) => {
                    const cell = cohort.cells.find((entry) => entry.week === week);
                    const intensity = intensityOf(cell);
                    return (
                      <TableCell
                        key={week}
                        data-intensity={intensity}
                        data-state={cell?.state ?? "future"}
                        style={
                          {
                            "--cell-alpha": CELL_ALPHA[intensity],
                          } as React.CSSProperties
                        }
                        className="bg-[color-mix(in_oklch,var(--chart-1)_calc(var(--cell-alpha)*100%),transparent)] text-right tabular-nums"
                      >
                        {cellText(cell)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            낮음
            {CELL_ALPHA.map((alpha) => (
              <span
                key={alpha}
                aria-hidden="true"
                style={{ "--cell-alpha": alpha } as React.CSSProperties}
                className="inline-block size-3 rounded-sm border bg-[color-mix(in_oklch,var(--chart-1)_calc(var(--cell-alpha)*100%),transparent)]"
              />
            ))}
            높음
          </span>
          <span>† 아직 끝나지 않은 주</span>
          <span>— 아직 오지 않은 주 또는 데이터 없음</span>
        </div>
      </CardContent>
    </Card>
  );
}
