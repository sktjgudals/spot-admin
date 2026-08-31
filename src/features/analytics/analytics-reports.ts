import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
  runAnalyticsRealtimeReport,
  type AnalyticsDataApiOptions,
  type AnalyticsReportResponse,
  type AnalyticsRunRealtimeReportRequest,
  type AnalyticsRunReportRequest,
} from "./analytics-data-api";
import type {
  AnalyticsDateRange,
  AnalyticsDataQualityNotice,
  AnalyticsMetricValue,
  AnalyticsPropertyConfig,
  AnalyticsQuotaState,
  AnalyticsReportColumn,
  AnalyticsReportResult,
  AnalyticsReportTable,
  AnalyticsReportView,
} from "./types";

type FetchAnalyticsReportInput = {
  view: AnalyticsReportView;
  property: AnalyticsPropertyConfig;
  range: AnalyticsDateRange;
  accessToken: string;
  signal?: AbortSignal;
};

type ReportDefinition = {
  key: string;
  title: string;
  description: string;
  request: AnalyticsRunReportRequest;
};

const RANGE_DAYS: Record<AnalyticsDateRange, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
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

function dateRange(range: AnalyticsDateRange, previous = false) {
  const days = RANGE_DAYS[range];
  return previous
    ? { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }
    : { startDate: `${days}daysAgo`, endDate: "yesterday" };
}

function metricRequests(names: readonly string[]) {
  return names.map((name) => ({ name }));
}

function dimensionRequests(names: readonly string[]) {
  return names.map((name) => ({ name }));
}

function assertFiniteNumericString(value: string | undefined): asserts value is string {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    throw new AnalyticsDataApiError(
      "invalid-response",
      "Google Analytics 응답에 올바르지 않은 숫자 값이 포함되어 있습니다.",
    );
  }
}

function numericValue(value: string | undefined): number {
  assertFiniteNumericString(value);
  const parsed = Number(value);
  return parsed;
}

function firstMetric(report: AnalyticsReportResponse | undefined, metricName: string): number {
  if (!report) return 0;
  const metricIndex = report.metricHeaders.findIndex(({ name }) => name === metricName);
  if (metricIndex < 0) return 0;
  const row = report.rows[0] ?? report.totals[0];
  if (!row) return 0;
  return numericValue(row.metricValues[metricIndex]?.value);
}

function reportRows(report: AnalyticsReportResponse): Array<Record<string, string>> {
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

function dataQualityNoticesForReport(
  report: AnalyticsReportResponse | undefined,
  definition: Pick<ReportDefinition, "key" | "title">,
): AnalyticsDataQualityNotice[] {
  if (!report?.metadata) return [];
  const scope = { reportKey: definition.key, reportTitle: definition.title };
  const notices: AnalyticsDataQualityNotice[] = [];

  if (report.metadata.subjectToThresholding === true) {
    notices.push({ ...scope, kind: "thresholding" });
  }
  for (const sampling of report.metadata.samplingMetadatas ?? []) {
    notices.push({
      ...scope,
      kind: "sampling",
      samplesReadCount: sampling.samplesReadCount,
      samplingSpaceSize: sampling.samplingSpaceSize,
    });
  }
  if (report.metadata.dataLossFromOtherRow === true) {
    notices.push({ ...scope, kind: "other-row" });
  }
  return notices;
}

function dataQualityNoticesFromReports(
  reports: readonly AnalyticsReportResponse[],
  definitions: ReadonlyArray<Pick<ReportDefinition, "key" | "title">>,
): AnalyticsDataQualityNotice[] {
  return reports.flatMap((report, index) => {
    const definition = definitions[index];
    return definition ? dataQualityNoticesForReport(report, definition) : [];
  });
}

function quotaFromReports(reports: AnalyticsReportResponse[]): AnalyticsQuotaState | null {
  const byKey = new Map<string, { consumed: number; remaining: number }>();
  reports.forEach((report) => {
    Object.entries(report.propertyQuota ?? {}).forEach(([key, entry]) => {
      const existing = byKey.get(key);
      byKey.set(key, {
        consumed: Math.max(existing?.consumed ?? 0, entry.consumed),
        remaining: Math.min(existing?.remaining ?? Number.MAX_SAFE_INTEGER, entry.remaining),
      });
    });
  });
  if (byKey.size === 0) return null;
  return {
    entries: Array.from(byKey, ([key, entry]) => ({ key, ...entry })).sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
  };
}

function currencyFromReports(reports: AnalyticsReportResponse[]): string {
  return reports.find((report) => report.metadata?.currencyCode)?.metadata?.currencyCode ?? "KRW";
}

function apiOptions(input: FetchAnalyticsReportInput): AnalyticsDataApiOptions {
  return { accessToken: input.accessToken, signal: input.signal };
}

async function fetchOverview(
  input: FetchAnalyticsReportInput,
): Promise<AnalyticsReportResult> {
  const requests: AnalyticsRunReportRequest[] = [
    {
      dateRanges: [dateRange(input.range)],
      metrics: metricRequests(OVERVIEW_METRICS),
      returnPropertyQuota: true,
    },
    {
      dateRanges: [dateRange(input.range, true)],
      metrics: metricRequests(OVERVIEW_METRICS),
      returnPropertyQuota: true,
    },
    {
      dateRanges: [dateRange(input.range)],
      dimensions: dimensionRequests(["date"]),
      metrics: metricRequests(["sessions"]),
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: RANGE_DAYS[input.range],
      returnPropertyQuota: true,
    },
  ];
  const response = await batchRunAnalyticsReports(
    input.property.id,
    { requests },
    apiOptions(input),
  );
  const current = response.reports[0];
  const previous = response.reports[1];
  const trend = response.reports[2];
  const metrics = OVERVIEW_METRICS.map<AnalyticsMetricValue>((key) => ({
    key,
    label: FIELD_LABELS[key],
    value: firstMetric(current, key),
    previousValue: firstMetric(previous, key),
    format: FIELD_FORMATS[key] ?? "integer",
  }));
  const trendRows = trend ? reportRows(trend) : [];
  const trendHasData = trendRows.some((row) => numericValue(row.sessions) > 0);
  const qualityDefinitions = [
    { key: "current-summary", title: "현재 기간 핵심 지표" },
    { key: "previous-summary", title: "이전 기간 핵심 지표" },
    { key: "daily-trend", title: "일별 흐름" },
  ];
  return {
    view: "overview",
    metrics,
    trend: trendRows,
    currencyCode: currencyFromReports(response.reports),
    quota: quotaFromReports(response.reports),
    dataQualityNotices: dataQualityNoticesFromReports(
      response.reports,
      qualityDefinitions,
    ),
    isEmpty: metrics.every(({ value }) => value === 0) && !trendHasData,
  };
}

function coreRequest(
  range: AnalyticsDateRange,
  dimensions: readonly string[],
  metrics: readonly string[],
  orderMetric: string,
): AnalyticsRunReportRequest {
  return {
    dateRanges: [dateRange(range)],
    dimensions: dimensionRequests(dimensions),
    metrics: metricRequests(metrics),
    orderBys: [{ desc: true, metric: { metricName: orderMetric } }],
    limit: 25,
    returnPropertyQuota: true,
  };
}

function definitionsForView(
  view: "acquisition" | "engagement" | "conversion-revenue",
  range: AnalyticsDateRange,
): ReportDefinition[] {
  if (view === "acquisition") {
    return [
      {
        key: "channels",
        title: "채널·소스·캠페인",
        description: "세션 기준 유입 경로와 주요 이벤트를 비교합니다.",
        request: coreRequest(
          range,
          ["sessionDefaultChannelGroup", "sessionSource", "sessionMedium", "sessionCampaignName"],
          ["sessions", "engagedSessions", "keyEvents"],
          "sessions",
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
      ),
    },
    {
      key: "revenue-summary",
      title: "구매·매출",
      description: "GA4 전자상거래 이벤트가 수집된 경우에만 표시됩니다.",
      request: {
        dateRanges: [dateRange(range)],
        metrics: metricRequests(["ecommercePurchases", "purchaseRevenue", "totalRevenue"]),
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
  const definitions = definitionsForView(input.view, input.range);
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
    quota: quotaFromReports(reports),
    dataQualityNotices: dataQualityNoticesFromReports(reports, definitions),
    isEmpty: tables.every(({ rows }) => rows.length === 0) && metrics.every(({ value }) => value === 0),
  };
}

function emptyReport(): AnalyticsReportResponse {
  return {
    dimensionHeaders: [],
    metricHeaders: [],
    rows: [],
    totals: [],
    rowCount: 0,
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
    quota: quotaFromReports(reports),
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
  return fetchCoreTables({ ...input, view: input.view });
}
