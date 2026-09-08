import { z } from "zod/mini";

/**
 * Same host, two surfaces. `runFunnelReport` only exists on v1alpha; routing by
 * method keeps that fact in one table instead of scattering a second base URL
 * through the call sites — and keeps every method on one auth/retry path.
 */
const ANALYTICS_DATA_API_ROOTS = {
  v1beta: "https://analyticsdata.googleapis.com/v1beta",
  v1alpha: "https://analyticsdata.googleapis.com/v1alpha",
} as const;

const METHOD_VERSIONS = {
  runReport: "v1beta",
  batchRunReports: "v1beta",
  runRealtimeReport: "v1beta",
  runFunnelReport: "v1alpha",
} as const satisfies Record<string, keyof typeof ANALYTICS_DATA_API_ROOTS>;

type AnalyticsDataApiMethod = keyof typeof METHOD_VERSIONS;

/** GA4 appends this dimension itself when a request carries two date ranges. */
export const DATE_RANGE_DIMENSION = "dateRange";

/** First dimension of every `funnelTable`. */
export const FUNNEL_STEP_DIMENSION = "funnelStepName";

/**
 * The four metrics GA4 returns in a `funnelTable`.
 *
 * `funnelStepCompletionRate` and `funnelStepAbandonmentRate` are reported with
 * `type: "TYPE_INTEGER"` but hold fractional strings ("0.412" = 41.2%). Read
 * them as floats and never branch on the header's `type`.
 */
export const FUNNEL_METRICS = [
  "activeUsers",
  "funnelStepCompletionRate",
  "funnelStepAbandonments",
  "funnelStepAbandonmentRate",
] as const;

const MAX_RETRIES = 2;

/**
 * GA4 answers a request naming a dimension the property has never registered
 * with a plain 400. Telling an operator "요청을 처리하지 못했습니다" there sends
 * them looking for a bug in this app instead of at the GA4 custom definition
 * they still have to create.
 */
const UNKNOWN_FIELD_PATTERN = /is not a valid (?:dimension|metric)/i;

export type AnalyticsDateRangeRequest = {
  startDate: string;
  endDate: string;
  name?: string;
};

export type AnalyticsDimensionRequest = { name: string };
export type AnalyticsMetricRequest = { name: string };

export type AnalyticsOrderByRequest = {
  desc?: boolean;
  dimension?: { dimensionName: string; orderType?: string };
  metric?: { metricName: string };
};

export type AnalyticsStringFilter = {
  matchType?:
    | "EXACT"
    | "BEGINS_WITH"
    | "ENDS_WITH"
    | "CONTAINS"
    | "FULL_REGEXP"
    | "PARTIAL_REGEXP";
  value: string;
  caseSensitive?: boolean;
};

export type AnalyticsInListFilter = {
  values: readonly string[];
  caseSensitive?: boolean;
};

export type AnalyticsFieldFilter = {
  fieldName: string;
  stringFilter?: AnalyticsStringFilter;
  inListFilter?: AnalyticsInListFilter;
};

export type AnalyticsFilterExpression =
  | { filter: AnalyticsFieldFilter }
  | { andGroup: { expressions: readonly AnalyticsFilterExpression[] } }
  | { orGroup: { expressions: readonly AnalyticsFilterExpression[] } }
  | { notExpression: AnalyticsFilterExpression };

export type AnalyticsCohort = {
  name: string;
  /** GA4 supports no other cohort membership dimension. */
  dimension: "firstSessionDate";
  dateRange: { startDate: string; endDate: string };
};

export type AnalyticsCohortsRange = {
  granularity: "DAILY" | "WEEKLY" | "MONTHLY";
  startOffset: number;
  endOffset: number;
};

export type AnalyticsCohortSpec = {
  cohorts: readonly AnalyticsCohort[];
  cohortsRange: AnalyticsCohortsRange;
};

export type AnalyticsFunnelParameterFilter = {
  eventParameterName?: string;
  itemParameterName?: string;
  stringFilter?: AnalyticsStringFilter;
  inListFilter?: AnalyticsInListFilter;
};

export type AnalyticsFunnelParameterFilterExpression =
  | { funnelParameterFilter: AnalyticsFunnelParameterFilter }
  | {
      andGroup: {
        expressions: readonly AnalyticsFunnelParameterFilterExpression[];
      };
    }
  | {
      orGroup: {
        expressions: readonly AnalyticsFunnelParameterFilterExpression[];
      };
    }
  | { notExpression: AnalyticsFunnelParameterFilterExpression };

export type AnalyticsFunnelEventFilter = {
  eventName: string;
  funnelParameterFilterExpression?: AnalyticsFunnelParameterFilterExpression;
};

export type AnalyticsFunnelFilterExpression =
  | { funnelEventFilter: AnalyticsFunnelEventFilter }
  | { funnelFieldFilter: AnalyticsFieldFilter }
  | { andGroup: { expressions: readonly AnalyticsFunnelFilterExpression[] } }
  | { orGroup: { expressions: readonly AnalyticsFunnelFilterExpression[] } }
  | { notExpression: AnalyticsFunnelFilterExpression };

export type AnalyticsFunnelStep = {
  name: string;
  /**
   * Never sent by this app's builders — an unverified request field would ride
   * to production untested. Kept so a future step definition can opt in.
   */
  isDirectlyFollowedBy?: boolean;
  filterExpression: AnalyticsFunnelFilterExpression;
};

export type AnalyticsRunFunnelReportRequest = {
  dateRanges: readonly AnalyticsDateRangeRequest[];
  /** Omitting `isOpenFunnel` means a closed funnel, which is what we want. */
  funnel: { isOpenFunnel?: boolean; steps: readonly AnalyticsFunnelStep[] };
  funnelBreakdown?: {
    breakdownDimension: AnalyticsDimensionRequest;
    /** GA4 defaults to the first 5 distinct breakdown values. */
    limit?: number;
  };
  dimensionFilter?: AnalyticsFilterExpression;
  limit?: number;
  returnPropertyQuota?: boolean;
};

export type AnalyticsRunReportRequest = {
  /** Absent on cohort requests — GA4 rejects `dateRanges` beside a `cohortSpec`. */
  dateRanges?: readonly AnalyticsDateRangeRequest[];
  dimensions?: readonly AnalyticsDimensionRequest[];
  metrics: readonly AnalyticsMetricRequest[];
  dimensionFilter?: AnalyticsFilterExpression;
  cohortSpec?: AnalyticsCohortSpec;
  orderBys?: readonly AnalyticsOrderByRequest[];
  limit?: number;
  offset?: number;
  keepEmptyRows?: boolean;
  returnPropertyQuota?: boolean;
};

export type AnalyticsRunRealtimeReportRequest = {
  dimensions?: readonly AnalyticsDimensionRequest[];
  metrics: readonly AnalyticsMetricRequest[];
  orderBys?: readonly AnalyticsOrderByRequest[];
  limit?: number;
  returnPropertyQuota?: boolean;
};

const headerSchema = z.looseObject({ name: z.string() });
const metricHeaderSchema = z.looseObject({
  name: z.string(),
  type: z.optional(z.string()),
});
const valueSchema = z.looseObject({ value: z.string() });
const rowSchema = z.looseObject({
  dimensionValues: z.prefault(z.array(valueSchema), []),
  metricValues: z.prefault(z.array(valueSchema), []),
});
const quotaCountSchema = z.number().check(z.int(), z.nonnegative());
const quotaEntrySchema = z.looseObject({
  consumed: z.prefault(quotaCountSchema, 0),
  remaining: z.prefault(quotaCountSchema, 0),
});
const samplingMetadataSchema = z.looseObject({
  samplesReadCount: z.string(),
  samplingSpaceSize: z.string(),
});

const reportResponseSchema = z.looseObject({
  dimensionHeaders: z.prefault(z.array(headerSchema), []),
  metricHeaders: z.prefault(z.array(metricHeaderSchema), []),
  rows: z.prefault(z.array(rowSchema), []),
  totals: z.prefault(z.array(rowSchema), []),
  rowCount: z.prefault(z.number().check(z.int(), z.nonnegative()), 0),
  metadata: z.optional(
    z.looseObject({
      currencyCode: z.optional(z.string()),
      timeZone: z.optional(z.string()),
      subjectToThresholding: z.optional(z.boolean()),
      dataLossFromOtherRow: z.optional(z.boolean()),
      samplingMetadatas: z.optional(z.array(samplingMetadataSchema)),
    }),
  ),
  propertyQuota: z.optional(z.record(z.string(), quotaEntrySchema)),
});

const batchResponseSchema = z.looseObject({
  reports: z.prefault(z.array(reportResponseSchema), []),
});

const funnelSubReportSchema = z.looseObject({
  dimensionHeaders: z.prefault(z.array(headerSchema), []),
  metricHeaders: z.prefault(z.array(metricHeaderSchema), []),
  rows: z.prefault(z.array(rowSchema), []),
  metadata: z.optional(
    z.looseObject({
      samplingMetadatas: z.optional(z.array(samplingMetadataSchema)),
    }),
  ),
});

const funnelResponseSchema = z.looseObject({
  funnelTable: z.optional(funnelSubReportSchema),
  funnelVisualization: z.optional(funnelSubReportSchema),
  /** Optional on purpose: `returnPropertyQuota` is not doc-confirmed for v1alpha. */
  propertyQuota: z.optional(z.record(z.string(), quotaEntrySchema)),
  kind: z.optional(z.string()),
});

const metadataFieldSchema = z.looseObject({
  apiName: z.string(),
  uiName: z.optional(z.string()),
  customDefinition: z.optional(z.boolean()),
});

const metadataResponseSchema = z.looseObject({
  name: z.optional(z.string()),
  dimensions: z.prefault(z.array(metadataFieldSchema), []),
  metrics: z.prefault(z.array(metadataFieldSchema), []),
});

const apiErrorBodySchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      status: z.optional(z.string()),
      code: z.optional(z.number()),
      message: z.optional(z.string()),
    }),
  ),
});

export type AnalyticsReportResponse = z.infer<typeof reportResponseSchema>;
export type AnalyticsBatchReportResponse = z.infer<typeof batchResponseSchema>;
export type AnalyticsFunnelSubReport = z.infer<typeof funnelSubReportSchema>;
export type AnalyticsFunnelReportResponse = z.infer<typeof funnelResponseSchema>;
export type AnalyticsMetadataResponse = z.infer<typeof metadataResponseSchema>;

export type AnalyticsDataApiErrorKind =
  | "expired"
  | "permission"
  | "quota"
  | "request"
  | "service"
  | "network"
  | "invalid-response"
  | "configuration"
  /** The property has no such dimension or metric — usually an unregistered custom definition. */
  | "unknown-field";

export class AnalyticsDataApiError extends Error {
  constructor(
    readonly kind: AnalyticsDataApiErrorKind,
    message: string,
    readonly options: {
      status?: number;
      retryAfterMs?: number;
      apiMessage?: string;
    } = {},
  ) {
    super(message);
    this.name = "AnalyticsDataApiError";
  }

  get status(): number | undefined {
    return this.options.status;
  }

  get retryAfterMs(): number | undefined {
    return this.options.retryAfterMs;
  }

  /** Google's own sentence, kept so the UI can name the missing field. */
  get apiMessage(): string | undefined {
    return this.options.apiMessage;
  }
}

type AnalyticsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AnalyticsWait = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export type AnalyticsDataApiOptions = {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: AnalyticsFetch;
  wait?: AnalyticsWait;
};

const defaultWait: AnalyticsWait = (milliseconds, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

function assertPropertyId(propertyId: string): string {
  const normalized = propertyId.trim().replace(/^properties\//, "");
  if (!/^\d+$/.test(normalized)) {
    throw new AnalyticsDataApiError(
      "configuration",
      "Google Analytics 속성 ID가 올바르지 않습니다.",
    );
  }
  return normalized;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

async function classifyResponseError(response: Response): Promise<AnalyticsDataApiError> {
  const parsed = apiErrorBodySchema.safeParse(
    await response.json().catch(() => null),
  );
  const apiStatus = parsed.success ? parsed.data.error?.status : undefined;
  const apiMessage = parsed.success ? parsed.data.error?.message : undefined;
  const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));

  if (response.status === 401) {
    return new AnalyticsDataApiError(
      "expired",
      "Google Analytics 연결이 만료되었습니다. 다시 연결해 주세요.",
      { status: response.status },
    );
  }
  if (response.status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return new AnalyticsDataApiError(
      "quota",
      "Google Analytics API 할당량이 소진되었습니다.",
      { status: response.status, retryAfterMs },
    );
  }
  if (response.status === 403) {
    return new AnalyticsDataApiError(
      "permission",
      "이 Google 계정에는 선택한 GA4 속성을 볼 권한이 없습니다.",
      { status: response.status },
    );
  }
  if (response.status >= 500) {
    return new AnalyticsDataApiError(
      "service",
      "Google Analytics 서비스가 일시적으로 응답하지 않습니다.",
      { status: response.status, retryAfterMs },
    );
  }
  if (
    response.status === 400 &&
    apiMessage !== undefined &&
    UNKNOWN_FIELD_PATTERN.test(apiMessage)
  ) {
    return new AnalyticsDataApiError(
      "unknown-field",
      "GA4 속성에 요청한 측정기준 또는 측정항목이 없습니다.",
      { status: response.status, apiMessage },
    );
  }
  return new AnalyticsDataApiError(
    "request",
    "Google Analytics 보고서 요청을 처리하지 못했습니다.",
    { status: response.status },
  );
}

function shouldRetry(error: AnalyticsDataApiError): boolean {
  return error.kind === "quota" || error.kind === "service" || error.kind === "network";
}

function invalidAnalyticsResponse(): never {
  throw new AnalyticsDataApiError(
    "invalid-response",
    "Google Analytics 응답이 요청한 보고서 구조와 일치하지 않습니다.",
  );
}

function hasOrderedNames(
  actual: readonly { name: string }[],
  expected: readonly { name: string }[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((header, index) => header.name === expected[index]?.name)
  );
}

function assertReportContract(
  report: AnalyticsReportResponse,
  request: Pick<AnalyticsRunReportRequest, "dimensions" | "metrics" | "dateRanges">,
): void {
  // Two date ranges make GA4 append its own trailing `dateRange` dimension.
  // Accepting it unconditionally would hide a genuinely reordered response.
  const expectedDimensions = [
    ...(request.dimensions ?? []),
    ...((request.dateRanges?.length ?? 0) > 1
      ? [{ name: DATE_RANGE_DIMENSION }]
      : []),
  ];
  if (
    !hasOrderedNames(report.dimensionHeaders, expectedDimensions) ||
    !hasOrderedNames(report.metricHeaders, request.metrics)
  ) {
    invalidAnalyticsResponse();
  }

  for (const row of report.rows) {
    if (
      row.dimensionValues.length !== expectedDimensions.length ||
      row.metricValues.length !== request.metrics.length
    ) {
      invalidAnalyticsResponse();
    }
  }

  for (const total of report.totals) {
    if (total.metricValues.length !== request.metrics.length) {
      invalidAnalyticsResponse();
    }
  }
}

function assertFunnelContract(
  response: AnalyticsFunnelReportResponse,
  request: Pick<AnalyticsRunFunnelReportRequest, "funnelBreakdown">,
): asserts response is AnalyticsFunnelReportResponse & {
  funnelTable: AnalyticsFunnelSubReport;
} {
  const table = response.funnelTable;
  if (!table) invalidAnalyticsResponse();
  if (table.dimensionHeaders[0]?.name !== FUNNEL_STEP_DIMENSION) {
    invalidAnalyticsResponse();
  }

  const breakdownName = request.funnelBreakdown?.breakdownDimension.name;
  const expectedDimensionCount = breakdownName ? 2 : 1;
  if (
    table.dimensionHeaders.length !== expectedDimensionCount ||
    (breakdownName !== undefined &&
      table.dimensionHeaders[1]?.name !== breakdownName)
  ) {
    invalidAnalyticsResponse();
  }

  // Looked up by name, never by position: the four funnel metrics are stable
  // but their order is GA4's business, not ours.
  const metricNames = new Set(table.metricHeaders.map(({ name }) => name));
  for (const metric of FUNNEL_METRICS) {
    if (!metricNames.has(metric)) invalidAnalyticsResponse();
  }

  for (const row of table.rows) {
    if (
      row.dimensionValues.length !== table.dimensionHeaders.length ||
      row.metricValues.length !== table.metricHeaders.length
    ) {
      invalidAnalyticsResponse();
    }
  }
}

async function performAnalyticsRequest<T>(
  url: string,
  init: { method: "GET" | "POST"; body?: string },
  schema: z.ZodMiniType<T>,
  options: AnalyticsDataApiOptions,
): Promise<T> {
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new AnalyticsDataApiError(
      "expired",
      "Google Analytics 연결이 필요합니다.",
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? defaultWait;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method,
        headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: options.signal,
      });
    } catch (reason) {
      if (options.signal?.aborted) throw reason;
      const networkError = new AnalyticsDataApiError(
        "network",
        "Google Analytics 서버에 연결하지 못했습니다.",
      );
      if (attempt < MAX_RETRIES) {
        await wait(250 * 2 ** attempt, options.signal);
        continue;
      }
      throw networkError;
    }

    if (!response.ok) {
      const responseError = await classifyResponseError(response);
      if (shouldRetry(responseError) && attempt < MAX_RETRIES) {
        await wait(
          responseError.retryAfterMs ?? 250 * 2 ** attempt,
          options.signal,
        );
        continue;
      }
      throw responseError;
    }

    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new AnalyticsDataApiError(
        "invalid-response",
        "Google Analytics 응답 형식을 확인할 수 없습니다.",
      );
    }
    return parsed.data;
  }

  throw new AnalyticsDataApiError(
    "service",
    "Google Analytics 보고서 요청을 완료하지 못했습니다.",
  );
}

async function requestAnalyticsData<T>(
  propertyId: string,
  method: AnalyticsDataApiMethod,
  body: object,
  schema: z.ZodMiniType<T>,
  options: AnalyticsDataApiOptions,
): Promise<T> {
  const normalizedPropertyId = assertPropertyId(propertyId);
  const root = ANALYTICS_DATA_API_ROOTS[METHOD_VERSIONS[method]];
  return performAnalyticsRequest(
    `${root}/properties/${normalizedPropertyId}:${method}`,
    { method: "POST", body: JSON.stringify(body) },
    schema,
    options,
  );
}

export async function runAnalyticsReport(
  propertyId: string,
  request: AnalyticsRunReportRequest,
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsReportResponse> {
  const response = await requestAnalyticsData(
    propertyId,
    "runReport",
    request,
    reportResponseSchema,
    options,
  );
  assertReportContract(response, request);
  return response;
}

export async function batchRunAnalyticsReports(
  propertyId: string,
  request: { requests: readonly AnalyticsRunReportRequest[] },
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsBatchReportResponse> {
  const response = await requestAnalyticsData(
    propertyId,
    "batchRunReports",
    request,
    batchResponseSchema,
    options,
  );
  if (response.reports.length !== request.requests.length) {
    invalidAnalyticsResponse();
  }
  response.reports.forEach((report, index) => {
    const reportRequest = request.requests[index];
    if (!reportRequest) invalidAnalyticsResponse();
    assertReportContract(report, reportRequest);
  });
  return response;
}

export async function runAnalyticsRealtimeReport(
  propertyId: string,
  request: AnalyticsRunRealtimeReportRequest,
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsReportResponse> {
  const response = await requestAnalyticsData(
    propertyId,
    "runRealtimeReport",
    request,
    reportResponseSchema,
    options,
  );
  assertReportContract(response, request);
  return response;
}

export async function runAnalyticsFunnelReport(
  propertyId: string,
  request: AnalyticsRunFunnelReportRequest,
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsFunnelReportResponse> {
  const response = await requestAnalyticsData(
    propertyId,
    "runFunnelReport",
    request,
    funnelResponseSchema,
    options,
  );
  assertFunnelContract(response, request);
  return response;
}

/**
 * The property's own dimension and metric catalogue.
 *
 * Used to answer one question honestly: has this property registered the
 * `account_type` user-scoped custom dimension? Guessing "yes" and letting the
 * report 400 would tell an operator their filter is broken instead of that a
 * GA4 custom definition is missing.
 */
export async function getAnalyticsMetadata(
  propertyId: string,
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsMetadataResponse> {
  const normalizedPropertyId = assertPropertyId(propertyId);
  return performAnalyticsRequest(
    `${ANALYTICS_DATA_API_ROOTS.v1beta}/properties/${normalizedPropertyId}/metadata`,
    { method: "GET" },
    metadataResponseSchema,
    options,
  );
}
