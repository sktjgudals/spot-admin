"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock3,
  Database,
  Link2,
  Loader2,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import { formatGaDate, formatMetric, percentChange } from "./analytics-format";
import { EVENT_LABELS } from "./analytics-labels";
import { analyticsQueryKeys } from "./analytics-query-keys";
import { fetchAnalyticsReport } from "./analytics-reports";
import {
  AnalyticsErrorState,
  ConnectionFact,
  DataQualityPanel,
  QuotaFooter,
  StatusCard,
} from "./AnalyticsStates";
import {
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
} from "./analytics-token-store";
import type {
  AnalyticsDateRange,
  AnalyticsMetricValue,
  AnalyticsPropertyConfig,
  AnalyticsReportColumn,
  AnalyticsReportResult,
  AnalyticsReportTable,
  AnalyticsReportView,
} from "./types";
import { useAnalyticsConnection } from "./use-analytics-connection";

type AnalyticsDashboardProps = {
  properties: AnalyticsPropertyConfig[];
  googleClientId: string;
  configError: string | null;
};

const VIEW_OPTIONS: Array<{ value: AnalyticsReportView; label: string }> = [
  { value: "overview", label: "개요" },
  { value: "acquisition", label: "유입" },
  { value: "engagement", label: "참여" },
  { value: "conversion-revenue", label: "전환·매출" },
  { value: "realtime", label: "실시간" },
];

const DATE_RANGE_OPTIONS: Array<{ value: AnalyticsDateRange; label: string }> = [
  { value: "7d", label: "최근 7일" },
  { value: "28d", label: "최근 28일" },
  { value: "90d", label: "최근 90일" },
];

export function AnalyticsDashboard({
  properties,
  googleClientId,
  configError,
}: AnalyticsDashboardProps) {
  const configured = !configError && properties.length > 0;
  const { token, connecting, connectionError, connect, disconnect } =
    useAnalyticsConnection({ googleClientId, enabled: configured });
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [view, setView] = useState<AnalyticsReportView>("overview");
  const [range, setRange] = useState<AnalyticsDateRange>("28d");

  const selectedProperty =
    properties.find((property) => property.id === propertyId) ?? properties[0];

  if (configError || !selectedProperty) {
    return (
      <AnalyticsPageFrame>
        <StatusCard
          icon={Database}
          title="분석 설정 필요"
          description={configError ?? "GA4 속성 설정을 확인해 주세요."}
        >
          <p className="text-sm leading-6 text-muted-foreground">
            공개 속성 ID와 표시 이름만 설정할 수 있습니다. OAuth 토큰이나 서비스 계정 키는
            환경 변수에 넣지 마세요.
          </p>
        </StatusCard>
      </AnalyticsPageFrame>
    );
  }

  if (token.status !== "connected") {
    const expired = token.status === "expired";
    return (
      <AnalyticsPageFrame>
        <StatusCard
          icon={expired ? Clock3 : ShieldCheck}
          title={
            expired
              ? "Google Analytics 연결이 만료되었습니다."
              : "Google Analytics를 안전하게 연결하세요"
          }
          description={
            expired
              ? "단기 액세스 토큰이 폐기되었습니다. 보고서를 다시 보려면 재연결해 주세요."
              : "SUPER_ADMIN의 Google 계정으로 읽기 전용 권한을 승인하면 보고서를 조회합니다."
          }
        >
          <div className="grid gap-3 rounded-lg border bg-muted/35 p-4 text-sm sm:grid-cols-3">
            <ConnectionFact title="권한" value="analytics.readonly만 요청" />
            <ConnectionFact title="보관" value="이 탭의 메모리에만 유지 · 로그아웃 시 삭제" />
            <ConnectionFact title="전송" value="Google Data API로 직접 요청" />
          </div>
          {connectionError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {connectionError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void connect()} disabled={connecting}>
              {connecting ? <Loader2 className="animate-spin" /> : <Link2 />}
              Google Analytics 연결
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              선택한 계정에는 각 GA4 속성의 Viewer 이상 권한이 필요합니다.
            </p>
          </div>
        </StatusCard>
      </AnalyticsPageFrame>
    );
  }

  return (
    <AnalyticsPageFrame>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            GA4 속성
            <select
              className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
              value={selectedProperty.id}
              onChange={(event) => setPropertyId(event.target.value)}
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label} · {platformLabel(property.platform)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            비교 기간
            <select
              className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
              value={range}
              onChange={(event) => setRange(event.target.value as AnalyticsDateRange)}
              disabled={view === "realtime"}
            >
              {DATE_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button variant="outline" onClick={disconnect}>
          <Unplug /> 연결 끊기
        </Button>
      </div>

      <div
        role="group"
        aria-label="Google Analytics 보고서"
        className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1"
      >
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            className={cn(
              "min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              view === option.value && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => setView(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <AnalyticsQueryView
        key={`${selectedProperty.id}:${view}:${range}:${token.generation}`}
        property={selectedProperty}
        view={view}
        range={range}
        generation={token.generation}
      />
    </AnalyticsPageFrame>
  );
}

function AnalyticsPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Product intelligence
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Google Analytics</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Dopa 웹·앱의 유입, 참여, 전환과 실시간 흐름을 GA4 원본 기준으로 확인합니다.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" /> SUPER_ADMIN 전용
        </span>
      </header>
      {children}
    </div>
  );
}

function AnalyticsQueryView({
  property,
  view,
  range,
  generation,
}: {
  property: AnalyticsPropertyConfig;
  view: AnalyticsReportView;
  range: AnalyticsDateRange;
  generation: number;
}) {
  const query = useQuery<AnalyticsReportResult, Error>({
    queryKey: analyticsQueryKeys.report(generation, property.id, view, range),
    queryFn: ({ signal }) => {
      const accessToken = getAnalyticsAccessToken();
      if (!accessToken) {
        throw new AnalyticsDataApiError(
          "expired",
          "Google Analytics 연결이 만료되었습니다.",
        );
      }
      return fetchAnalyticsReport({
        property,
        view,
        range,
        filters: EMPTY_FILTERS,
        accessToken,
        signal,
      });
    },
    staleTime: view === "realtime" ? 60_000 : 5 * 60_000,
    gcTime: view === "realtime" ? 60_000 : 5 * 60_000,
    refetchInterval: view === "realtime" ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const completionAnnouncedRef = useRef(false);
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");

  useEffect(() => {
    if (query.error instanceof AnalyticsDataApiError && query.error.kind === "expired") {
      clearAnalyticsAccessToken("expired");
    }
  }, [query.error]);

  useEffect(() => {
    if (!query.data || completionAnnouncedRef.current) return;

    completionAnnouncedRef.current = true;
    setCompletionAnnouncement(reportCompletionSummary(property.label, query.data));
  }, [property.label, query.data]);

  let content: React.ReactNode;
  if (query.isPending) {
    content = <AnalyticsLoadingState />;
  } else if (query.isError) {
    content = <AnalyticsErrorState error={query.error} retry={() => void query.refetch()} />;
  } else if (query.data.isEmpty) {
    const subjectToThresholding = query.data.dataQualityNotices.some(
      (notice) => notice.kind === "thresholding",
    );
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={query.data.dataQualityNotices} />
        <AnalyticsEmptyState view={view} subjectToThresholding={subjectToThresholding} />
        <QuotaFooter quota={query.data.quota} />
      </div>
    );
  } else {
    content = <AnalyticsReportContent result={query.data} />;
  }

  return (
    <>
      {!query.isError ? (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={query.isPending ? "true" : undefined}
          aria-label={query.isPending ? "Google Analytics 보고서 로딩 중" : undefined}
        >
          {query.isPending
            ? "Google Analytics 보고서를 불러오는 중입니다."
            : completionAnnouncement}
        </p>
      ) : null}
      {content}
    </>
  );
}

function AnalyticsLoadingState() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="space-y-3 py-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-8 w-28 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-muted/50" />
    </div>
  );
}

function reportCompletionSummary(
  propertyLabel: string,
  result: AnalyticsReportResult,
): string {
  const viewLabel =
    VIEW_OPTIONS.find((option) => option.value === result.view)?.label ?? "분석";
  const prefix = `${propertyLabel} ${viewLabel} 보고서를 불러왔습니다.`;

  if (result.isEmpty) return `${prefix} 표시할 데이터가 없습니다.`;
  if (result.view === "overview") {
    return `${prefix} 핵심 지표 ${result.metrics.length}개, 일별 데이터 ${result.series.points.length}개가 표시됩니다.`;
  }
  // Funnel and retention are not yet offered from this dashboard's view
  // selector (Task 4 adds their panels); this branch keeps the summary
  // sentence well-typed for the widened result union in the meantime.
  if (result.view === "funnel" || result.view === "retention") {
    return prefix;
  }

  const rowCount = result.tables.reduce((total, table) => total + table.rows.length, 0);
  return `${prefix} 표 ${result.tables.length}개, 행 ${rowCount}개가 표시됩니다.`;
}

function AnalyticsEmptyState({
  view,
  subjectToThresholding,
}: {
  view: AnalyticsReportView;
  subjectToThresholding: boolean;
}) {
  const conversion = view === "conversion-revenue";
  return (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <BarChart3 className="size-5" />
        </div>
        <h2 className="mt-4 font-semibold">
          {subjectToThresholding
            ? "선택한 기간에 표시할 수 있는 데이터가 없습니다."
            : "선택한 기간에 수집된 데이터가 없습니다."}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {subjectToThresholding
            ? "GA4 개인정보 보호 임계값으로 일부 데이터가 보고서에 표시되지 않을 수 있습니다. 위 데이터 품질 안내를 함께 확인해 주세요."
            : conversion
            ? "GA4에서 구매·주요 이벤트 값이 확인되지 않습니다. 이벤트 수집과 주요 이벤트 정의 여부를 별도로 확인해 주세요."
            : "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다."}
        </p>
      </CardContent>
    </Card>
  );
}

function AnalyticsReportContent({ result }: { result: AnalyticsReportResult }) {
  // Funnel and retention are not yet offered from this dashboard's view
  // selector (Task 4 adds their dedicated panels); this guard keeps the
  // component well-typed for the widened result union in the meantime.
  if (result.view === "funnel" || result.view === "retention") return null;

  return (
    <div className="space-y-4">
      <DataQualityPanel notices={result.dataQualityNotices} />
      {result.metrics.length > 0 ? (
        <MetricGrid metrics={result.metrics} currencyCode={result.currencyCode} />
      ) : null}
      {result.view === "overview" ? (
        <TrendPanel
          rows={result.series.points.map((point) => ({
            date: point.date,
            activeUsers: String(point.current.activeUsers),
            sessions: String(point.current.sessions),
            keyEvents: "0",
          }))}
        />
      ) : (
        result.tables.map((table) => (
          <AnalyticsTable key={table.key} table={table} currencyCode={result.currencyCode} />
        ))
      )}
      <QuotaFooter quota={result.quota} />
    </div>
  );
}

function MetricGrid({
  metrics,
  currencyCode,
}: {
  metrics: AnalyticsMetricValue[];
  currencyCode: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => {
        const delta = percentChange(metric.value, metric.previousValue);
        return (
          <Card key={metric.key} size="sm">
            <CardContent>
              <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                {formatMetric(metric.value, metric.format, currencyCode)}
              </p>
              {metric.previousValue !== undefined ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  이전 기간 {formatMetric(metric.previousValue, metric.format, currencyCode)}
                  {delta === null ? null : (
                    <span className={cn("ml-1.5 font-medium", delta >= 0 ? "text-success" : "text-destructive")}>
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  )}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TrendPanel({ rows }: { rows: Array<Record<string, string>> }) {
  const maxSessions = Math.max(...rows.map((row) => Number(row.sessions ?? 0)), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>일별 흐름</CardTitle>
        <CardDescription>세션의 일별 변화입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <figure
          aria-label="일별 세션 추이"
          className="overflow-x-auto rounded-lg bg-muted/30 p-4"
        >
          <div className="grid h-56 min-w-96 grid-flow-col auto-cols-fr items-end gap-1">
            {rows.map((row) => {
              const sessions = Number(row.sessions ?? 0);
              const height = Math.max(3, (sessions / maxSessions) * 100);
              return (
                <div
                  key={row.date}
                  className="group relative h-full min-w-2"
                  title={`${formatGaDate(row.date)} · 세션 ${sessions.toLocaleString("ko-KR")}`}
                >
                  <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5 rounded-t-sm bg-primary/75 transition-colors group-hover:bg-primary"
                    style={{ height: `${height}%` }}
                  />
                  <span className="sr-only">
                    {formatGaDate(row.date)} 세션 {sessions}
                  </span>
                </div>
              );
            })}
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

function AnalyticsTable({
  table,
  currencyCode,
}: {
  table: AnalyticsReportTable;
  currencyCode: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <CardTitle>{table.title}</CardTitle>
            <CardDescription className="mt-1">{table.description}</CardDescription>
          </div>
          <p className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {tableRowCountLabel(table)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {table.rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            이 보고서에 표시할 데이터가 없습니다.
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">{table.title}</TableCaption>
            <TableHeader>
              <TableRow>
                {table.columns.map((column) => (
                  <TableHead key={column.key} className={column.kind === "metric" ? "text-right" : undefined}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, rowIndex) => (
                <TableRow key={`${table.key}:${rowIndex}`}>
                  {table.columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.kind === "metric" && "text-right font-medium tabular-nums",
                        column.kind === "dimension" && "max-w-80 truncate",
                      )}
                      title={column.kind === "dimension" ? row[column.key] : undefined}
                    >
                      {formatCell(column, row[column.key] ?? "", currencyCode)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function tableRowCountLabel(table: AnalyticsReportTable): string {
  const displayed = table.rows.length;
  const total = table.totalRowCount;
  if (displayed < total) {
    return `상위 ${displayed.toLocaleString("ko-KR")}개 표시 · 전체 ${total.toLocaleString("ko-KR")}개 결과`;
  }
  return `전체 ${total.toLocaleString("ko-KR")}개 결과 표시`;
}

function formatCell(
  column: AnalyticsReportColumn,
  value: string,
  currencyCode: string,
): string {
  if (column.kind === "metric") {
    return formatMetric(Number(value), column.format ?? "integer", currencyCode);
  }
  if (column.key === "eventName" && EVENT_LABELS[value]) {
    return `${EVENT_LABELS[value]} · ${value}`;
  }
  if (column.key === "date") return formatGaDate(value);
  return value || "(not set)";
}

function platformLabel(platform: AnalyticsPropertyConfig["platform"]): string {
  if (platform === "web") return "Web";
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  return "Web + App";
}
