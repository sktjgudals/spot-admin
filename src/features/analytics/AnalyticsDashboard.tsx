"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock3,
  Database,
  Link2,
  Loader2,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { createRetryableLazyComponent } from "@/components/performance/RetryableLazyComponent";
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
import {
  AnalyticsFilterBar,
  type AccountTypeAvailability,
} from "./AnalyticsFilterBar";
import {
  EMPTY_FILTERS,
  availablePlatforms,
  filtersKey,
  type AnalyticsFilters,
} from "./analytics-filters";
import {
  formatCount,
  formatGaDate,
  formatMetric,
  percentChange,
} from "./analytics-format";
import { EVENT_LABELS } from "./analytics-labels";
import { analyticsQueryKeys } from "./analytics-query-keys";
import {
  fetchAnalyticsCapabilities,
  fetchAnalyticsReport,
  type AnalyticsCapabilities,
} from "./analytics-reports";
import { FunnelPanel } from "./FunnelPanel";
import { FUNNEL_IDS, type FunnelId } from "./funnel-definitions";
import { InsightsPanel } from "./InsightsPanel";
import { RetentionHeatmap } from "./RetentionHeatmap";
import type { TrendChartProps } from "./charts/TrendChart";
import {
  AnalyticsErrorState,
  ConnectionFact,
  DataQualityPanel,
  QuotaBanner,
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
  AnalyticsQuotaCategory,
  AnalyticsQuotaState,
  AnalyticsReportColumn,
  AnalyticsReportResult,
  AnalyticsReportTable,
  AnalyticsReportView,
  AnalyticsTrendMetric,
  AnalyticsTrendSeries,
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
  { value: "funnel", label: "퍼널" },
  { value: "retention", label: "리텐션" },
  { value: "realtime", label: "실시간" },
];

/** Which GA4 token pool each view spends. Exhausting one leaves the others alive. */
const VIEW_POOLS: Record<AnalyticsReportView, AnalyticsQuotaCategory> = {
  overview: "core",
  acquisition: "core",
  engagement: "core",
  "conversion-revenue": "core",
  funnel: "funnel",
  retention: "core",
  realtime: "realtime",
};

const STALE_TIMES: Record<AnalyticsReportView, number> = {
  overview: 5 * 60_000,
  acquisition: 5 * 60_000,
  engagement: 5 * 60_000,
  "conversion-revenue": 5 * 60_000,
  // Funnel and cohort reports are the expensive ones; 15 minutes keeps a tab
  // switch from spending the pool again.
  funnel: 15 * 60_000,
  retention: 15 * 60_000,
  realtime: 60_000,
};

const TREND_METRIC_OPTIONS: Array<{
  value: AnalyticsTrendMetric;
  label: string;
}> = [
  { value: "activeUsers", label: "활성 사용자" },
  { value: "newUsers", label: "신규 사용자" },
  { value: "sessions", label: "세션" },
];

const EMPTY_DESCRIPTIONS: Record<AnalyticsReportView, string> = {
  overview:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
  acquisition:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
  engagement:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
  "conversion-revenue":
    "GA4에서 구매·주요 이벤트 값이 확인되지 않습니다. 이벤트 수집과 주요 이벤트 정의 여부를 별도로 확인해 주세요.",
  funnel:
    "선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을 확인해 주세요.",
  retention:
    "최근 6주 코호트에서 첫 세션 사용자가 확인되지 않습니다. 코호트 기간은 기간 선택과 무관하게 고정입니다.",
  realtime:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
};

const DATE_RANGE_OPTIONS: Array<{ value: AnalyticsDateRange; label: string }> = [
  { value: "7d", label: "최근 7일" },
  { value: "28d", label: "최근 28일" },
  { value: "90d", label: "최근 90일" },
];

/**
 * The chart never enters the analytics route's first chunk. Asserted by
 * scripts/test-admin-ui-foundation.mjs: the dashboard may name its props type,
 * but the component itself arrives only through this dynamic import.
 */
const LazyTrendChart = createRetryableLazyComponent<TrendChartProps>(
  () => import("./charts/TrendChart"),
  {
    loading: (
      <div
        className="h-64 animate-pulse rounded-lg bg-muted/50"
        aria-hidden="true"
      />
    ),
    errorTitle: "추세 차트를 불러오지 못했습니다.",
  },
);

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
  const [filters, setFilters] = useState<AnalyticsFilters>(EMPTY_FILTERS);
  const [funnelId, setFunnelId] = useState<FunnelId>(FUNNEL_IDS[0]);
  const [funnelBreakdown, setFunnelBreakdown] = useState(false);
  const [trendMetric, setTrendMetric] =
    useState<AnalyticsTrendMetric>("activeUsers");
  const [showPrevious, setShowPrevious] = useState(true);
  const [latestQuota, setLatestQuota] = useState<AnalyticsQuotaState | null>(null);
  const [exhaustedPools, setExhaustedPools] = useState<AnalyticsQuotaCategory[]>(
    [],
  );

  const selectedProperty =
    properties.find((property) => property.id === propertyId) ?? properties[0];

  // A quota reading and a filter selection belong to one property. Carrying
  // them across would put another property's numbers behind this one's banner.
  //
  // Adjusted during render rather than in an effect: an effect would paint the
  // new property once with the old property's filters and banner first, and
  // the repo's lint rule rejects that cascading render outright.
  const [filteredPropertyId, setFilteredPropertyId] = useState(
    selectedProperty?.id,
  );
  if (selectedProperty?.id !== filteredPropertyId) {
    setFilteredPropertyId(selectedProperty?.id);
    setFilters(EMPTY_FILTERS);
    setFunnelId(FUNNEL_IDS[0]);
    setFunnelBreakdown(false);
    setLatestQuota(null);
    setExhaustedPools([]);
  }

  /**
   * Each view spends a different GA4 token pool, so a reading never outlives
   * the report that produced it — otherwise the banner names the pool of the
   * view an operator just left while the next one loads.
   */
  const selectView = (nextView: AnalyticsReportView) => {
    setView(nextView);
    setLatestQuota(null);
  };

  const capabilities = useQuery<AnalyticsCapabilities, Error>({
    queryKey: analyticsQueryKeys.capabilities(
      token.generation,
      selectedProperty?.id ?? "",
    ),
    queryFn: ({ signal }) => {
      const accessToken = getAnalyticsAccessToken();
      if (!accessToken || !selectedProperty) {
        throw new AnalyticsDataApiError(
          "expired",
          "Google Analytics 연결이 만료되었습니다.",
        );
      }
      return fetchAnalyticsCapabilities({
        propertyId: selectedProperty.id,
        accessToken,
        signal,
      });
    },
    enabled: token.status === "connected" && Boolean(selectedProperty),
    // A property's custom definitions do not change while a tab is open, and a
    // failed metadata read must never block the reports.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const handleQuotaError = useCallback((pool: AnalyticsQuotaCategory) => {
    setExhaustedPools((current) =>
      current.includes(pool) ? current : [...current, pool],
    );
  }, []);

  const accountTypeAvailability: AccountTypeAvailability = capabilities.isPending
    ? "pending"
    : capabilities.isError
      ? "unknown"
      : capabilities.data?.accountTypeDimension
        ? "available"
        : "unavailable";

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
          <div className="grid min-w-0 gap-1.5">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              비교 기간
              <select
                className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
                value={range}
                onChange={(event) => setRange(event.target.value as AnalyticsDateRange)}
                disabled={view === "realtime" || view === "retention"}
              >
                {DATE_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {view === "retention" ? (
              <p className="text-xs text-muted-foreground">
                리텐션은 최근 6주 코호트 고정
              </p>
            ) : null}
          </div>
        </div>
        <Button variant="outline" onClick={disconnect}>
          <Unplug /> 연결 끊기
        </Button>
      </div>

      <AnalyticsFilterBar
        filters={filters}
        onChange={setFilters}
        platforms={availablePlatforms(selectedProperty.platform)}
        accountTypeAvailability={accountTypeAvailability}
        disabled={view === "realtime"}
      />

      <QuotaBanner quota={latestQuota} />

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
            disabled={
              view !== option.value &&
              exhaustedPools.includes(VIEW_POOLS[option.value])
            }
            className={cn(
              "min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              view === option.value && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => selectView(option.value)}
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
        filters={filters}
        funnelId={funnelId}
        funnelBreakdown={funnelBreakdown}
        trendMetric={trendMetric}
        showPrevious={showPrevious}
        onFunnelIdChange={setFunnelId}
        onFunnelBreakdownChange={setFunnelBreakdown}
        onTrendMetricChange={setTrendMetric}
        onShowPreviousChange={setShowPrevious}
        onQuota={setLatestQuota}
        onQuotaError={handleQuotaError}
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

type AnalyticsViewControls = {
  funnelId: FunnelId;
  funnelBreakdown: boolean;
  trendMetric: AnalyticsTrendMetric;
  showPrevious: boolean;
  onFunnelIdChange: (funnelId: FunnelId) => void;
  onFunnelBreakdownChange: (breakdown: boolean) => void;
  onTrendMetricChange: (metric: AnalyticsTrendMetric) => void;
  onShowPreviousChange: (showPrevious: boolean) => void;
};

function AnalyticsQueryView({
  property,
  view,
  range,
  generation,
  filters,
  onQuota,
  onQuotaError,
  ...controls
}: AnalyticsViewControls & {
  property: AnalyticsPropertyConfig;
  view: AnalyticsReportView;
  range: AnalyticsDateRange;
  generation: number;
  filters: AnalyticsFilters;
  onQuota: (quota: AnalyticsQuotaState | null) => void;
  onQuotaError: (pool: AnalyticsQuotaCategory) => void;
}) {
  const query = useQuery<AnalyticsReportResult, Error>({
    queryKey: analyticsQueryKeys.report(
      generation,
      property.id,
      view,
      range,
      filtersKey(filters),
      view === "funnel"
        ? `${controls.funnelId}:${controls.funnelBreakdown}`
        : "",
    ),
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
        filters,
        funnelId: controls.funnelId,
        funnelBreakdown: controls.funnelBreakdown,
        accessToken,
        signal,
      });
    },
    // Keeps the table an operator is reading on screen while a filter applies.
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES[view],
    gcTime: STALE_TIMES[view],
    refetchInterval: view === "realtime" ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const completionAnnouncedRef = useRef(false);
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");

  useEffect(() => {
    if (!(query.error instanceof AnalyticsDataApiError)) return;
    if (query.error.kind === "expired") clearAnalyticsAccessToken("expired");
    // Only an actual refusal closes a tab — never a low reading.
    if (query.error.kind === "quota") onQuotaError(VIEW_POOLS[view]);
  }, [onQuotaError, query.error, view]);

  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return;
    onQuota(query.data.quota);
  }, [onQuota, query.data, query.isPlaceholderData]);

  useEffect(() => {
    if (!query.data || query.isPlaceholderData || completionAnnouncedRef.current) {
      return;
    }
    completionAnnouncedRef.current = true;
    setCompletionAnnouncement(reportCompletionSummary(property.label, query.data));
  }, [property.label, query.data, query.isPlaceholderData]);

  let content: React.ReactNode;
  if (query.isPending) {
    content = <AnalyticsLoadingState />;
  } else if (query.isError) {
    content = (
      <AnalyticsErrorState error={query.error} retry={() => void query.refetch()} />
    );
  } else if (query.data.isEmpty && query.data.view !== "funnel") {
    // The funnel keeps its own panel even when empty: its preset selector is
    // the only way back to a funnel that does have data.
    const subjectToThresholding = query.data.dataQualityNotices.some(
      (notice) => notice.kind === "thresholding",
    );
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={query.data.dataQualityNotices} />
        <AnalyticsEmptyState
          view={view}
          subjectToThresholding={subjectToThresholding}
        />
        <QuotaFooter quota={query.data.quota} />
      </div>
    );
  } else {
    content = (
      <AnalyticsReportContent
        result={query.data}
        isRefreshing={query.isPlaceholderData}
        {...controls}
      />
    );
  }

  return (
    <>
      {!query.isError ? (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={
            query.isPending || query.isPlaceholderData ? "true" : undefined
          }
        >
          {/* No `aria-label`: it would override this text as the region's
              accessible name and have the announcement read twice. */}
          {query.isPending
            ? "Google Analytics 보고서를 불러오는 중입니다."
            : query.isPlaceholderData
              ? // A filter is only one of the controls that lands here; the
                // funnel preset, its breakdown and the date range do too.
                "보고서 갱신 중입니다. 이전 결과를 표시하고 있습니다."
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
  if (result.view === "funnel") {
    return `${prefix} 단계 ${result.steps.length}개, 1단계 사용자 ${formatCount(
      result.steps[0]?.users ?? 0,
    )}명이 표시됩니다.`;
  }
  if (result.view === "retention") {
    return `${prefix} 코호트 ${result.cohorts.length}개가 표시됩니다.`;
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
            : EMPTY_DESCRIPTIONS[view]}
        </p>
      </CardContent>
    </Card>
  );
}

function AnalyticsReportContent({
  result,
  isRefreshing,
  funnelId,
  funnelBreakdown,
  trendMetric,
  showPrevious,
  onFunnelIdChange,
  onFunnelBreakdownChange,
  onTrendMetricChange,
  onShowPreviousChange,
}: AnalyticsViewControls & {
  result: AnalyticsReportResult;
  /** `keepPreviousData` is on screen while the new request is in flight. */
  isRefreshing: boolean;
}) {
  return (
    <div className="space-y-4">
      <DataQualityPanel notices={result.dataQualityNotices} />
      {result.view === "overview" ? (
        <>
          {result.metrics.length > 0 ? (
            <MetricGrid metrics={result.metrics} currencyCode={result.currencyCode} />
          ) : null}
          <InsightsPanel insights={result.insights} />
          <TrendPanel
            series={result.series}
            metric={trendMetric}
            onMetricChange={onTrendMetricChange}
            showPrevious={showPrevious}
            onShowPreviousChange={onShowPreviousChange}
          />
        </>
      ) : result.view === "funnel" ? (
        <FunnelPanel
          result={result}
          funnelId={funnelId}
          onFunnelIdChange={onFunnelIdChange}
          breakdown={funnelBreakdown}
          onBreakdownChange={onFunnelBreakdownChange}
          isRefreshing={isRefreshing}
        />
      ) : result.view === "retention" ? (
        <RetentionHeatmap result={result} />
      ) : (
        <>
          {result.metrics.length > 0 ? (
            <MetricGrid metrics={result.metrics} currencyCode={result.currencyCode} />
          ) : null}
          {result.tables.map((table) => (
            <AnalyticsTable
              key={table.key}
              table={table}
              currencyCode={result.currencyCode}
            />
          ))}
        </>
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

function TrendPanel({
  series,
  metric,
  onMetricChange,
  showPrevious,
  onShowPreviousChange,
}: {
  series: AnalyticsTrendSeries;
  metric: AnalyticsTrendMetric;
  onMetricChange: (metric: AnalyticsTrendMetric) => void;
  showPrevious: boolean;
  onShowPreviousChange: (showPrevious: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>일별 추세</CardTitle>
        <CardDescription>
          선택한 지표의 일별 변화입니다. 이전 기간은 같은 길이의 직전 구간입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="추세 지표"
            className="flex gap-1 rounded-lg border bg-muted/40 p-1"
          >
            {TREND_METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={metric === option.value}
                onClick={() => onMetricChange(option.value)}
                className={cn(
                  "min-h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  metric === option.value && "bg-background text-foreground shadow-sm",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={showPrevious}
              onChange={(event) => onShowPreviousChange(event.target.checked)}
            />
            이전 기간 비교
          </label>
        </div>
        <LazyTrendChart
          series={series}
          metric={metric}
          showPrevious={showPrevious}
        />
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
