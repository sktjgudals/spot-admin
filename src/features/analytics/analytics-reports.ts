import {
  batchRunAnalyticsReports,
  runAnalyticsRealtimeReport,
  DATE_RANGE_DIMENSION,
  getAnalyticsMetadata,
  type AnalyticsDataApiOptions,
  type AnalyticsFilterExpression,
  type AnalyticsReportResponse,
  type AnalyticsRunRealtimeReportRequest,
  type AnalyticsRunReportRequest,
} from "./analytics-data-api";
import {
  ACCOUNT_TYPE_DIMENSION,
  buildDimensionFilter,
  normalizePlatform,
  type AnalyticsFilters,
} from "./analytics-filters";
import { fetchFunnel } from "./analytics-funnel";
import { buildInsights } from "./analytics-insights";
import { fetchRetention } from "./analytics-retention";
import { FUNNEL_IDS, type FunnelId } from "./funnel-definitions";
import {
  RANGE_DAYS,
  analyticsDateRange,
  currencyFromReports,
  dataQualityNoticesForReport,
  emptyReport,
  firstMetric,
  numericValue,
  quotaFromReports,
  reportRows,
  type AnalyticsReportScope,
  type ReportQualityMetadata,
} from "./analytics-report-shaping";
import type {
  AnalyticsDateRange,
  AnalyticsDataQualityNotice,
  AnalyticsMetricValue,
  AnalyticsPropertyConfig,
  AnalyticsPlatformBreakdown,
  AnalyticsReportColumn,
  AnalyticsReportResult,
  AnalyticsReportTable,
  AnalyticsReportView,
  AnalyticsTrendSeries,
  AnalyticsTrendValues,
} from "./types";
import { ANALYTICS_TREND_METRICS } from "./types";

export type FetchAnalyticsReportInput = {
  view: AnalyticsReportView;
  property: AnalyticsPropertyConfig;
  range: AnalyticsDateRange;
  filters: AnalyticsFilters;
  /** Only read by the funnel view. */
  funnelId?: FunnelId;
  funnelBreakdown?: boolean;
  accessToken: string;
  signal?: AbortSignal;
  /** Injectable clock: the trend series has to know which day is "yesterday". */
  now?: Date;
};

type ReportDefinition = {
  key: string;
  title: string;
  description: string;
  request: AnalyticsRunReportRequest;
};

const FIELD_LABELS: Record<string, string> = {
  date: "날짜",
  activeUsers: "활성 사용자",
  newUsers: "신규 사용자",
  sessions: "세션",
  engagedSessions: "참여 세션",
  engagementRate: "참여율",
  keyEvents: "주요 이벤트",
  totalRevenue: "총수익",
  sessionDefaultChannelGroup: "채널",
  sessionSource: "소스",
  sessionMedium: "매체",
  sessionCampaignName: "캠페인",
  landingPagePlusQueryString: "랜딩 페이지",
  unifiedPageScreen: "페이지·화면",
  unifiedScreenName: "화면",
  screenPageViews: "조회수",
  userEngagementDuration: "참여 시간",
  eventName: "이벤트",
  eventCount: "이벤트 수",
  totalUsers: "사용자",
  ecommercePurchases: "구매",
  purchaseRevenue: "구매 수익",
  platform: "플랫폼",
  streamName: "데이터 스트림",
};

const FIELD_FORMATS: Record<string, AnalyticsMetricValue["format"]> = {
  engagementRate: "percent",
  totalRevenue: "currency",
  purchaseRevenue: "currency",
  userEngagementDuration: "duration",
};

const OVERVIEW_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "engagementRate",
  "keyEvents",
  "totalRevenue",
] as const;

function metricRequests(names: readonly string[]) {
  return names.map((name) => ({ name }));
}

function dimensionRequests(names: readonly string[]) {
  return names.map((name) => ({ name }));
}

function reportColumns(report: AnalyticsReportResponse): AnalyticsReportColumn[] {
  return [
    ...report.dimensionHeaders.map(({ name }) => ({
      key: name,
      label: FIELD_LABELS[name] ?? name,
      kind: "dimension" as const,
    })),
    ...report.metricHeaders.map(({ name }) => ({
      key: name,
      label: FIELD_LABELS[name] ?? name,
      kind: "metric" as const,
      format: FIELD_FORMATS[name] ?? ("integer" as const),
    })),
  ];
}

function toTable(
  definition: Pick<ReportDefinition, "key" | "title" | "description">,
  report: AnalyticsReportResponse,
): AnalyticsReportTable {
  return {
    ...definition,
    columns: reportColumns(report),
    rows: reportRows(report),
    totalRowCount: report.rowCount,
  };
}

function dataQualityNoticesFromReports(
  reports: readonly { metadata?: ReportQualityMetadata }[],
  definitions: ReadonlyArray<AnalyticsReportScope>,
): AnalyticsDataQualityNotice[] {
  return reports.flatMap((report, index) => {
    const definition = definitions[index];
    return definition
      ? dataQualityNoticesForReport(report.metadata, definition)
      : [];
  });
}

function apiOptions(input: FetchAnalyticsReportInput): AnalyticsDataApiOptions {
  return { accessToken: input.accessToken, signal: input.signal };
}

const CURRENT_RANGE_NAME = "current";
const PREVIOUS_RANGE_NAME = "previous";
const DAY_MS = 86_400_000;

const ZERO_TREND: AnalyticsTrendValues = {
  activeUsers: 0,
  newUsers: 0,
  sessions: 0,
};

function namedRanges(range: AnalyticsDateRange) {
  return [
    { ...analyticsDateRange(range), name: CURRENT_RANGE_NAME },
    { ...analyticsDateRange(range, true), name: PREVIOUS_RANGE_NAME },
  ];
}

/**
 * Which of the two requested windows a row belongs to.
 *
 * GA4's documented values for the implicit `dateRange` column are positional
 * (`date_range_0`, `date_range_1`); what it does with a supplied `name` is not
 * documented. Accept both, and drop anything else rather than guess — a row
 * assigned to the wrong window shifts the entire comparison by one period.
 */
function rangeSlot(value: string): "current" | "previous" | null {
  if (value === CURRENT_RANGE_NAME || value === "date_range_0") return "current";
  if (value === PREVIOUS_RANGE_NAME || value === "date_range_1") return "previous";
  return null;
}

function trendValues(row: Record<string, string>): AnalyticsTrendValues {
  return {
    activeUsers: numericValue(row.activeUsers),
    newUsers: numericValue(row.newUsers),
    sessions: numericValue(row.sessions),
  };
}

function formatGaDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10).replaceAll("-", "");
}

/**
 * The last day the request asked for.
 *
 * `analyticsDateRange` ends the current window at GA4's `yesterday`, so the
 * series has to end there too. The day is read from the operator's local
 * calendar and then carried in UTC purely as a day counter, the same way
 * `analytics-retention.ts` reads its cohort weeks: taking UTC fields directly
 * would put an operator in Seoul on yesterday's date for nine hours every
 * morning. The GA4 property's own time zone can still differ by a day; that
 * shows up as one zero-filled day at an edge, never as a shifted comparison.
 */
function windowEndDay(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - DAY_MS;
}

/**
 * GA4 omits a day with no events entirely — in either window, at either end.
 * So the series is built from the window that was *requested*, not from the
 * days that came back: `RANGE_DAYS[range]` days ending at `yesterday`, each
 * paired with the same calendar day one window earlier. Pairing by position
 * instead would shift every "이전 기간" value by however many days GA4 left
 * out, and drop the tail of the comparison entirely.
 */
function shapeSeries(
  report: AnalyticsReportResponse | undefined,
  range: AnalyticsDateRange,
  now: Date,
): AnalyticsTrendSeries {
  if (!report) return { points: [] };
  const current = new Map<string, AnalyticsTrendValues>();
  const previous = new Map<string, AnalyticsTrendValues>();

  for (const row of reportRows(report)) {
    const slot = rangeSlot(row[DATE_RANGE_DIMENSION] ?? "");
    if (slot === null) continue;
    (slot === "current" ? current : previous).set(row.date ?? "", trendValues(row));
  }

  // A property that returned nothing at all for the current window has no
  // trend to draw: a full window of zeros would read as a measured collapse.
  if (current.size === 0) return { points: [] };

  const days = RANGE_DAYS[range];
  const end = windowEndDay(now);
  const points = Array.from({ length: days }, (_unused, index) => {
    const timestamp = end - (days - 1 - index) * DAY_MS;
    const date = formatGaDay(timestamp);
    const previousDate = formatGaDay(timestamp - days * DAY_MS);
    return {
      date,
      previousDate,
      current: current.get(date) ?? ZERO_TREND,
      // A day GA4 omitted had no events, which is a zero — never a hole.
      previous: previous.get(previousDate) ?? ZERO_TREND,
    };
  });
  return { points };
}

function shapePlatforms(
  report: AnalyticsReportResponse | undefined,
): AnalyticsPlatformBreakdown[] {
  if (!report) return [];
  const byPlatform = new Map<
    string,
    { current: AnalyticsTrendValues; previous: AnalyticsTrendValues }
  >();

  for (const row of reportRows(report)) {
    const slot = rangeSlot(row[DATE_RANGE_DIMENSION] ?? "");
    if (slot === null) continue;
    const platform = normalizePlatform(row.platform ?? "");
    const entry = byPlatform.get(platform) ?? {
      current: ZERO_TREND,
      previous: ZERO_TREND,
    };
    // Assigned by branch, not by a computed key: a union-typed computed
    // property name widens the object type and loses `current`/`previous`.
    const next = { ...entry };
    if (slot === "current") next.current = trendValues(row);
    else next.previous = trendValues(row);
    byPlatform.set(platform, next);
  }

  return Array.from(byPlatform, ([platform, entry]) => ({ platform, ...entry })).sort(
    (a, b) =>
      b.current.activeUsers - a.current.activeUsers ||
      a.platform.localeCompare(b.platform),
  );
}

async function fetchOverview(
  input: FetchAnalyticsReportInput,
): Promise<AnalyticsReportResult> {
  const dimensionFilter = buildDimensionFilter(input.filters);
  const filtered = (request: AnalyticsRunReportRequest) =>
    dimensionFilter ? { ...request, dimensionFilter } : request;

  const requests: AnalyticsRunReportRequest[] = [
    filtered({
      dateRanges: [analyticsDateRange(input.range)],
      metrics: metricRequests(OVERVIEW_METRICS),
      returnPropertyQuota: true,
    }),
    filtered({
      dateRanges: [analyticsDateRange(input.range, true)],
      metrics: metricRequests(OVERVIEW_METRICS),
      returnPropertyQuota: true,
    }),
    // Both windows in one request: GA4 adds its own trailing `dateRange`
    // dimension, which is one report instead of two and keeps the comparison
    // inside a single quota charge.
    filtered({
      dateRanges: namedRanges(input.range),
      dimensions: dimensionRequests(["date"]),
      metrics: metricRequests(ANALYTICS_TREND_METRICS),
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 2 * RANGE_DAYS[input.range],
      returnPropertyQuota: true,
    }),
    filtered({
      dateRanges: namedRanges(input.range),
      dimensions: dimensionRequests(["platform"]),
      metrics: metricRequests(ANALYTICS_TREND_METRICS),
      orderBys: [{ desc: true, metric: { metricName: "activeUsers" } }],
      limit: 20,
      returnPropertyQuota: true,
    }),
  ];

  const response = await batchRunAnalyticsReports(
    input.property.id,
    { requests },
    apiOptions(input),
  );
  const [current, previous, seriesReport, platformReport] = response.reports;

  const metrics = OVERVIEW_METRICS.map<AnalyticsMetricValue>((key) => ({
    key,
    label: FIELD_LABELS[key],
    value: firstMetric(current, key),
    previousValue: firstMetric(previous, key),
    format: FIELD_FORMATS[key] ?? "integer",
  }));
  const series = shapeSeries(seriesReport, input.range, input.now ?? new Date());
  const platforms = shapePlatforms(platformReport);
  const currencyCode = currencyFromReports(response.reports);
  const qualityDefinitions = [
    { key: "current-summary", title: "현재 기간 핵심 지표" },
    { key: "previous-summary", title: "이전 기간 핵심 지표" },
    { key: "daily-series", title: "일별 추세" },
    { key: "platform-split", title: "플랫폼 비교" },
  ];

  return {
    view: "overview",
    metrics,
    series,
    platforms,
    insights: buildInsights({ metrics, platforms, currencyCode }),
    currencyCode,
    quota: quotaFromReports(response.reports, "core"),
    dataQualityNotices: dataQualityNoticesFromReports(
      response.reports,
      qualityDefinitions,
    ),
    isEmpty:
      metrics.every(({ value }) => value === 0) &&
      series.points.every(
        ({ current: point }) =>
          point.activeUsers === 0 && point.newUsers === 0 && point.sessions === 0,
      ),
  };
}

function coreRequest(
  range: AnalyticsDateRange,
  dimensions: readonly string[],
  metrics: readonly string[],
  orderMetric: string,
  dimensionFilter?: AnalyticsFilterExpression,
): AnalyticsRunReportRequest {
  return {
    dateRanges: [analyticsDateRange(range)],
    dimensions: dimensionRequests(dimensions),
    metrics: metricRequests(metrics),
    orderBys: [{ desc: true, metric: { metricName: orderMetric } }],
    limit: 25,
    ...(dimensionFilter ? { dimensionFilter } : {}),
    returnPropertyQuota: true,
  };
}

function definitionsForView(
  view: "acquisition" | "engagement" | "conversion-revenue",
  range: AnalyticsDateRange,
  dimensionFilter?: AnalyticsFilterExpression,
): ReportDefinition[] {
  if (view === "acquisition") {
    return [
      {
        key: "channels",
        title: "채널·소스·캠페인",
        description: "세션 기준 유입 경로와 주요 이벤트를 비교합니다.",
        request: coreRequest(
          range,
          [
            "sessionDefaultChannelGroup",
            "sessionSource",
            "sessionMedium",
            "sessionCampaignName",
          ],
          ["sessions", "engagedSessions", "keyEvents"],
          "sessions",
          dimensionFilter,
        ),
      },
      {
        key: "landing-pages",
        title: "랜딩 페이지",
        description: "처음 유입된 페이지별 참여 품질입니다.",
        request: coreRequest(
          range,
          ["landingPagePlusQueryString"],
          ["activeUsers", "sessions", "engagementRate", "keyEvents"],
          "sessions",
          dimensionFilter,
        ),
      },
    ];
  }
  if (view === "engagement") {
    return [
      {
        key: "pages-screens",
        title: "페이지·화면",
        description: "웹 페이지와 앱 화면을 하나의 기준으로 비교합니다.",
        request: coreRequest(
          range,
          ["unifiedPageScreen"],
          ["screenPageViews", "activeUsers", "userEngagementDuration"],
          "screenPageViews",
          dimensionFilter,
        ),
      },
      {
        key: "events",
        title: "이벤트",
        description: "제품 이벤트의 발생량과 주요 이벤트 지정 상태입니다.",
        request: coreRequest(
          range,
          ["eventName"],
          ["eventCount", "totalUsers", "keyEvents"],
          "eventCount",
          dimensionFilter,
        ),
      },
    ];
  }
  return [
    {
      key: "key-events",
      title: "전환 이벤트",
      description: "이벤트별 주요 이벤트 수와 도달 사용자를 확인합니다.",
      request: coreRequest(
        range,
        ["eventName"],
        ["eventCount", "keyEvents", "totalUsers"],
        "keyEvents",
        dimensionFilter,
      ),
    },
    {
      key: "revenue-summary",
      title: "구매·매출",
      description: "GA4 전자상거래 이벤트가 수집된 경우에만 표시됩니다.",
      request: {
        dateRanges: [analyticsDateRange(range)],
        metrics: metricRequests([
          "ecommercePurchases",
          "purchaseRevenue",
          "totalRevenue",
        ]),
        ...(dimensionFilter ? { dimensionFilter } : {}),
        returnPropertyQuota: true,
      },
    },
  ];
}

async function fetchCoreTables(
  input: FetchAnalyticsReportInput & {
    view: "acquisition" | "engagement" | "conversion-revenue";
  },
): Promise<AnalyticsReportResult> {
  const definitions = definitionsForView(
    input.view,
    input.range,
    buildDimensionFilter(input.filters),
  );
  const response = await batchRunAnalyticsReports(
    input.property.id,
    { requests: definitions.map(({ request }) => request) },
    apiOptions(input),
  );
  const reports = response.reports;
  const revenueReport = input.view === "conversion-revenue" ? reports[1] : undefined;
  const metrics = revenueReport
    ? ["ecommercePurchases", "purchaseRevenue", "totalRevenue"].map<AnalyticsMetricValue>(
        (key) => ({
          key,
          label: FIELD_LABELS[key],
          value: firstMetric(revenueReport, key),
          format: FIELD_FORMATS[key] ?? "integer",
        }),
      )
    : [];
  const tableDefinitions = input.view === "conversion-revenue" ? definitions.slice(0, 1) : definitions;
  const tables = tableDefinitions.map((definition, index) =>
    toTable(definition, reports[index] ?? emptyReport()),
  );
  return {
    view: input.view,
    tables,
    metrics,
    currencyCode: currencyFromReports(reports),
    quota: quotaFromReports(reports, "core"),
    dataQualityNotices: dataQualityNoticesFromReports(reports, definitions),
    isEmpty: tables.every(({ rows }) => rows.length === 0) && metrics.every(({ value }) => value === 0),
  };
}

async function fetchRealtime(
  input: FetchAnalyticsReportInput,
): Promise<AnalyticsReportResult> {
  const requests: Array<{
    definition: Pick<ReportDefinition, "key" | "title" | "description">;
    request: AnalyticsRunRealtimeReportRequest;
  }> = [
    {
      definition: { key: "summary", title: "실시간", description: "최근 30분 활성 사용자" },
      request: { metrics: metricRequests(["activeUsers"]), returnPropertyQuota: true },
    },
    {
      definition: {
        key: "screens",
        title: "현재 페이지·화면",
        description: "최근 30분 동안 사용자가 본 화면입니다.",
      },
      request: {
        dimensions: dimensionRequests(["unifiedScreenName"]),
        metrics: metricRequests(["activeUsers", "screenPageViews"]),
        orderBys: [{ desc: true, metric: { metricName: "activeUsers" } }],
        limit: 20,
        returnPropertyQuota: true,
      },
    },
    {
      definition: {
        key: "streams",
        title: "현재 플랫폼·스트림",
        description: "최근 30분 활성 사용자가 발생한 플랫폼과 데이터 스트림입니다.",
      },
      request: {
        dimensions: dimensionRequests(["platform", "streamName"]),
        metrics: metricRequests(["activeUsers"]),
        orderBys: [{ desc: true, metric: { metricName: "activeUsers" } }],
        limit: 20,
        returnPropertyQuota: true,
      },
    },
    {
      definition: {
        key: "events",
        title: "현재 이벤트",
        description: "최근 30분 제품 이벤트 발생량입니다.",
      },
      request: {
        dimensions: dimensionRequests(["eventName"]),
        metrics: metricRequests(["eventCount", "keyEvents"]),
        orderBys: [{ desc: true, metric: { metricName: "eventCount" } }],
        limit: 25,
        returnPropertyQuota: true,
      },
    },
  ];

  const reports = await Promise.all(
    requests.map(({ request }) =>
      runAnalyticsRealtimeReport(input.property.id, request, apiOptions(input)),
    ),
  );

  const summary = reports[0];
  const metrics: AnalyticsMetricValue[] = [
    {
      key: "activeUsers",
      label: "최근 30분 활성 사용자",
      value: firstMetric(summary, "activeUsers"),
      format: "integer",
    },
  ];
  const tables = requests.slice(1).map(({ definition }, index) =>
    toTable(definition, reports[index + 1] ?? emptyReport()),
  );
  return {
    view: "realtime",
    tables,
    metrics,
    currencyCode: currencyFromReports(reports),
    quota: quotaFromReports(reports, "realtime"),
    dataQualityNotices: dataQualityNoticesFromReports(
      reports,
      requests.map(({ definition }) => definition),
    ),
    isEmpty: metrics.every(({ value }) => value === 0) && tables.every(({ rows }) => rows.length === 0),
  };
}

export function fetchAnalyticsReport(
  input: FetchAnalyticsReportInput,
): Promise<AnalyticsReportResult> {
  if (input.view === "overview") return fetchOverview(input);
  if (input.view === "realtime") return fetchRealtime(input);
  if (input.view === "funnel") {
    return fetchFunnel({
      property: input.property,
      range: input.range,
      filters: input.filters,
      funnelId: input.funnelId ?? FUNNEL_IDS[0],
      breakdown: input.funnelBreakdown ?? false,
      accessToken: input.accessToken,
      signal: input.signal,
    });
  }
  if (input.view === "retention") {
    // No `range`: the cohort window is fixed at the last six complete weeks.
    return fetchRetention({
      property: input.property,
      filters: input.filters,
      accessToken: input.accessToken,
      signal: input.signal,
    });
  }
  return fetchCoreTables({ ...input, view: input.view });
}

export type AnalyticsCapabilities = {
  accountTypeDimension: boolean;
  customDimensions: string[];
};

/**
 * What this GA4 property can actually be asked.
 *
 * Offering an account-type filter a property has no custom dimension for turns
 * every filtered report into a 400 that reads like an app bug. One metadata
 * read, cached forever, answers it instead.
 */
export async function fetchAnalyticsCapabilities(input: {
  propertyId: string;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<AnalyticsCapabilities> {
  const metadata = await getAnalyticsMetadata(input.propertyId, {
    accessToken: input.accessToken,
    signal: input.signal,
  });
  return {
    accountTypeDimension: metadata.dimensions.some(
      ({ apiName }) => apiName === ACCOUNT_TYPE_DIMENSION,
    ),
    customDimensions: metadata.dimensions
      .filter((dimension) => dimension.customDefinition === true)
      .map(({ apiName }) => apiName)
      .sort(),
  };
}
