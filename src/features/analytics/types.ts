export const ANALYTICS_VIEWS = [
  "overview",
  "acquisition",
  "engagement",
  "conversion-revenue",
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

export type AnalyticsQuotaState = {
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

export type AnalyticsOverviewResult = {
  view: "overview";
  metrics: AnalyticsMetricValue[];
  trend: Array<Record<string, string>>;
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

export type AnalyticsReportResult = AnalyticsOverviewResult | AnalyticsTableResult;
