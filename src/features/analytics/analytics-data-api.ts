import { z } from "zod/mini";

const ANALYTICS_DATA_API_ROOT = "https://analyticsdata.googleapis.com/v1beta";
const MAX_RETRIES = 2;

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

export type AnalyticsRunReportRequest = {
  dateRanges: readonly AnalyticsDateRangeRequest[];
  dimensions?: readonly AnalyticsDimensionRequest[];
  metrics: readonly AnalyticsMetricRequest[];
  orderBys?: readonly AnalyticsOrderByRequest[];
  limit?: number;
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

const apiErrorBodySchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      status: z.optional(z.string()),
      code: z.optional(z.number()),
    }),
  ),
});

export type AnalyticsReportResponse = z.infer<typeof reportResponseSchema>;
export type AnalyticsBatchReportResponse = z.infer<typeof batchResponseSchema>;

export type AnalyticsDataApiErrorKind =
  | "expired"
  | "permission"
  | "quota"
  | "request"
  | "service"
  | "network"
  | "invalid-response"
  | "configuration";

export class AnalyticsDataApiError extends Error {
  constructor(
    readonly kind: AnalyticsDataApiErrorKind,
    message: string,
    readonly options: { status?: number; retryAfterMs?: number } = {},
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
  request: Pick<AnalyticsRunReportRequest, "dimensions" | "metrics">,
): void {
  const expectedDimensions = request.dimensions ?? [];
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

async function requestAnalyticsData<T>(
  propertyId: string,
  method: "runReport" | "batchRunReports" | "runRealtimeReport",
  body: object,
  schema: z.ZodMiniType<T>,
  options: AnalyticsDataApiOptions,
): Promise<T> {
  const normalizedPropertyId = assertPropertyId(propertyId);
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new AnalyticsDataApiError(
      "expired",
      "Google Analytics 연결이 필요합니다.",
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? defaultWait;
  const url = `${ANALYTICS_DATA_API_ROOT}/properties/${normalizedPropertyId}:${method}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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
