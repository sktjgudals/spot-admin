export const ANALYTICS_VIEWS = [
  "overview",
  "acquisition",
  "engagement",
  "conversion-revenue",
  "funnel",
  "retention",
  "realtime",
] as const;

export type AnalyticsReportView = (typeof ANALYTICS_VIEWS)[number];

export const ANALYTICS_DATE_RANGES = ["7d", "28d", "90d"] as const;

export type AnalyticsDateRange = (typeof ANALYTICS_DATE_RANGES)[number];

export type AnalyticsPropertyPlatform = "web" | "ios" | "android" | "mixed";

export type AnalyticsPropertyConfig = {
  id: string;
  label: string;
  platform: AnalyticsPropertyPlatform;
};

export type AnalyticsQuotaEntry = {
  key: string;
  consumed: number;
  remaining: number;
};

/** Which GA4 token pool the numbers came from. Core, Realtime and Funnel are billed separately. */
export type AnalyticsQuotaCategory = "core" | "realtime" | "funnel";

export type AnalyticsQuotaState = {
  category: AnalyticsQuotaCategory;
  entries: AnalyticsQuotaEntry[];
};

export type AnalyticsMetricValue = {
  key: string;
  label: string;
  value: number;
  previousValue?: number;
  format: "integer" | "percent" | "currency" | "duration";
};

export type AnalyticsReportColumn = {
  key: string;
  label: string;
  kind: "dimension" | "metric";
  format?: AnalyticsMetricValue["format"];
};

export type AnalyticsReportTable = {
  key: string;
  title: string;
  description: string;
  columns: AnalyticsReportColumn[];
  rows: Array<Record<string, string>>;
  /** Total result rows reported by GA4, independent of this request's limit. */
  totalRowCount: number;
};

type AnalyticsReportScopedNotice = {
  reportKey: string;
  reportTitle: string;
};

export type AnalyticsDataQualityNotice =
  | (AnalyticsReportScopedNotice & { kind: "thresholding" })
  | (AnalyticsReportScopedNotice & { kind: "other-row" })
  | (AnalyticsReportScopedNotice & {
      kind: "sampling";
      samplesReadCount: string;
      samplingSpaceSize: string;
    });

export const ANALYTICS_TREND_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
] as const;

export type AnalyticsTrendMetric = (typeof ANALYTICS_TREND_METRICS)[number];

export type AnalyticsTrendValues = Record<AnalyticsTrendMetric, number>;

export type AnalyticsTrendPoint = {
  /** `YYYYMMDD` in the current range. */
  date: string;
  /** `YYYYMMDD` in the previous range, aligned by position — `null` when the previous range is shorter. */
  previousDate: string | null;
  current: AnalyticsTrendValues;
  previous: AnalyticsTrendValues | null;
};

export type AnalyticsTrendSeries = { points: AnalyticsTrendPoint[] };

export type AnalyticsPlatformBreakdown = {
  platform: string;
  current: AnalyticsTrendValues;
  previous: AnalyticsTrendValues;
};

export type AnalyticsInsightSeverity = "warning" | "positive" | "info";

export type AnalyticsInsight = {
  id: string;
  severity: AnalyticsInsightSeverity;
  text: string;
  metric: string;
  scope: "total" | "platform";
  /** Percent for count metrics, percentage points for rate metrics, `null` when not comparable. */
  delta: number | null;
  current: number;
  previous: number;
};

export type AnalyticsOverviewResult = {
  view: "overview";
  metrics: AnalyticsMetricValue[];
  series: AnalyticsTrendSeries;
  platforms: AnalyticsPlatformBreakdown[];
  insights: AnalyticsInsight[];
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsTableResult = {
  view: "acquisition" | "engagement" | "conversion-revenue" | "realtime";
  tables: AnalyticsReportTable[];
  metrics: AnalyticsMetricValue[];
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsFunnelStepResult = {
  index: number;
  name: string;
  users: number;
  /** Fractions, as GA4 reports them: 0.412 is 41.2 %. `null` on the last step. */
  completionRate: number | null;
  abandonments: number | null;
  abandonmentRate: number | null;
  /** `users / steps[0].users`, 0 when the first step had no users. */
  shareOfFirst: number;
};

export type AnalyticsFunnelBreakdownRow = {
  value: string;
  steps: AnalyticsFunnelStepResult[];
};

export type AnalyticsFunnelResult = {
  view: "funnel";
  /** A `FunnelId` from `funnel-definitions.ts`; typed loosely so `types.ts` stays dependency-free. */
  funnelId: string;
  title: string;
  description: string;
  steps: AnalyticsFunnelStepResult[];
  breakdown: {
    dimension: "platform";
    rows: AnalyticsFunnelBreakdownRow[];
  } | null;
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsRetentionCellState = "complete" | "partial" | "future";

export type AnalyticsRetentionCell = {
  week: number;
  activeUsers: number;
  /** `activeUsers / totalUsers`, `null` when the cohort is empty. */
  rate: number | null;
  state: AnalyticsRetentionCellState;
};

export type AnalyticsRetentionCohort = {
  /** The cohort's ISO start date, which is also the `Cohort.name` sent to GA4. */
  name: string;
  startDate: string;
  endDate: string;
  totalUsers: number;
  cells: AnalyticsRetentionCell[];
};

export type AnalyticsRetentionResult = {
  view: "retention";
  granularity: "WEEKLY";
  horizon: number;
  cohorts: AnalyticsRetentionCohort[];
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsReportResult =
  | AnalyticsOverviewResult
  | AnalyticsTableResult
  | AnalyticsFunnelResult
  | AnalyticsRetentionResult;
