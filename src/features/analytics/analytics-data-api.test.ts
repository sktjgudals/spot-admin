import { describe, expect, it, vi } from "vitest";
import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
  getAnalyticsMetadata,
  runAnalyticsFunnelReport,
  runAnalyticsRealtimeReport,
  runAnalyticsReport,
} from "./analytics-data-api";

const reportBody = {
  dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
  metrics: [{ name: "activeUsers" }],
  returnPropertyQuota: true,
};

describe("Google Analytics Data API client", () => {
  it("calls the property-scoped REST endpoint and validates a report response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          metricHeaders: [{ name: "activeUsers", type: "TYPE_INTEGER" }],
          rows: [{ metricValues: [{ value: "42" }] }],
          rowCount: 175,
          metadata: {
            currencyCode: "KRW",
            timeZone: "Asia/Seoul",
            subjectToThresholding: true,
            dataLossFromOtherRow: true,
            samplingMetadatas: [
              { samplesReadCount: "12500", samplingSpaceSize: "50000" },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await runAnalyticsReport("1234", reportBody, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    expect(response.rows[0]?.metricValues[0]?.value).toBe("42");
    expect(response.rowCount).toBe(175);
    expect(response.metadata).toMatchObject({
      subjectToThresholding: true,
      dataLossFromOtherRow: true,
      samplingMetadatas: [
        { samplesReadCount: "12500", samplingSpaceSize: "50000" },
      ],
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/1234:runReport",
    );
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-access-token");
    expect(JSON.parse(String(init.body))).toEqual(reportBody);
  });

  it.each([
    [401, "expired"],
    [403, "permission"],
  ] as const)("maps HTTP %s to an explicit %s error", async (status, kind) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      runAnalyticsReport("1234", reportBody, {
        accessToken: "secret-access-token",
        fetchImpl,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<AnalyticsDataApiError>>({ kind }));
  });

  it("honors Retry-After for quota responses and stops after two retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "2" },
      }),
    );
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      runAnalyticsReport("1234", reportBody, {
        accessToken: "secret-access-token",
        fetchImpl,
        wait,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "quota",
        retryAfterMs: 2_000,
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 2_000, undefined);
    expect(wait).toHaveBeenNthCalledWith(2, 2_000, undefined);
  });

  it("uses batch and realtime methods without changing the property identifier", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          reports: [{ metricHeaders: [{ name: "activeUsers" }], rows: [] }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          metricHeaders: [{ name: "activeUsers" }],
          rows: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const options = { accessToken: "secret-access-token", fetchImpl };

    await batchRunAnalyticsReports("9876", { requests: [reportBody] }, options);
    await runAnalyticsRealtimeReport(
      "9876",
      { metrics: [{ name: "activeUsers" }], returnPropertyQuota: true },
      options,
    );

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://analyticsdata.googleapis.com/v1beta/properties/9876:batchRunReports",
      "https://analyticsdata.googleapis.com/v1beta/properties/9876:runRealtimeReport",
    ]);
  });

  it.each([
    [
      "missing metric headers",
      {},
      reportBody,
    ],
    [
      "reordered metric headers",
      {
        metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
        rows: [{ metricValues: [{ value: "3" }, { value: "2" }] }],
      },
      { ...reportBody, metrics: [{ name: "activeUsers" }, { name: "sessions" }] },
    ],
    [
      "short row values",
      {
        metricHeaders: [{ name: "activeUsers" }],
        rows: [{ metricValues: [] }],
      },
      reportBody,
    ],
  ] as const)("rejects a successful response with %s", async (_case, payload, request) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      runAnalyticsReport("1234", request, {
        accessToken: "secret-access-token",
        fetchImpl,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({ kind: "invalid-response" }),
    );
  });

  it("rejects a batch response that omits one of the requested reports", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          reports: [{ metricHeaders: [{ name: "activeUsers" }], rows: [] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      batchRunAnalyticsReports(
        "1234",
        { requests: [reportBody, reportBody] },
        { accessToken: "secret-access-token", fetchImpl },
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({ kind: "invalid-response" }),
    );
  });

  it("does not include the access token in failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const error = await runAnalyticsReport("1234", reportBody, {
      accessToken: "never-leak-this-token",
      fetchImpl,
      wait: vi.fn().mockResolvedValue(undefined),
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AnalyticsDataApiError);
    expect(String(error)).not.toContain("never-leak-this-token");
  });

  it("serializes a dimension filter and an offset for user-scoped paging", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          dimensionHeaders: [{ name: "dateHourMinute" }],
          metricHeaders: [{ name: "eventCount" }],
          rows: [],
          rowCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const request = {
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "dateHourMinute" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "customUser:dopa_uid",
          stringFilter: { matchType: "EXACT" as const, value: "user-1" },
        },
      },
      limit: 10_000,
      offset: 10_000,
      returnPropertyQuota: true,
    };

    await runAnalyticsReport("1234", request, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  it("classifies an unregistered custom dimension as unknown-field and keeps Google's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 400,
            status: "INVALID_ARGUMENT",
            message:
              "Field customUser:dopa_uid is not a valid dimension. For a list of valid dimensions, see …",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const error = await runAnalyticsReport("1234", reportBody, {
      accessToken: "secret-access-token",
      fetchImpl,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AnalyticsDataApiError);
    expect((error as AnalyticsDataApiError).kind).toBe("unknown-field");
    expect((error as AnalyticsDataApiError).apiMessage).toContain(
      "is not a valid dimension",
    );
  });

  it("leaves other 400 responses as generic request errors but keeps Google's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 400, message: "Invalid date range." } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const error = await runAnalyticsReport("1234", reportBody, {
      accessToken: "secret-access-token",
      fetchImpl,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AnalyticsDataApiError);
    expect((error as AnalyticsDataApiError).kind).toBe("request");
    // Two different funnel rejections share this kind; without the message the
    // screen cannot say which one happened.
    expect((error as AnalyticsDataApiError).apiMessage).toBe("Invalid date range.");
    // The message comes from the response body alone — never from the request
    // headers that carried the access token.
    expect(JSON.stringify((error as AnalyticsDataApiError).options)).not.toContain(
      "secret-access-token",
    );
  });

  it("routes runFunnelReport to v1alpha and round-trips the funnel body", async () => {
    const funnelRequest = {
      dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      funnel: {
        steps: [
          {
            name: "파티 상세",
            filterExpression: {
              funnelEventFilter: {
                eventName: "screen_view",
                funnelParameterFilterExpression: {
                  funnelParameterFilter: {
                    eventParameterName: "firebase_screen",
                    stringFilter: { matchType: "EXACT" as const, value: "/parties/:id" },
                  },
                },
              },
            },
          },
          {
            name: "신청 완료",
            filterExpression: { funnelEventFilter: { eventName: "api_mutation" } },
          },
        ],
      },
      funnelBreakdown: { breakdownDimension: { name: "platform" }, limit: 5 },
      returnPropertyQuota: true,
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: "analyticsData#runFunnelReport",
          funnelTable: {
            dimensionHeaders: [{ name: "funnelStepName" }, { name: "platform" }],
            metricHeaders: [
              { name: "activeUsers", type: "TYPE_INTEGER" },
              { name: "funnelStepCompletionRate", type: "TYPE_INTEGER" },
              { name: "funnelStepAbandonments", type: "TYPE_INTEGER" },
              { name: "funnelStepAbandonmentRate", type: "TYPE_INTEGER" },
            ],
            rows: [
              {
                dimensionValues: [{ value: "1. 파티 상세" }, { value: "RESERVED_TOTAL" }],
                metricValues: [
                  { value: "1000" },
                  { value: "0.412" },
                  { value: "588" },
                  { value: "0.588" },
                ],
              },
              {
                dimensionValues: [{ value: "1. 파티 상세" }, { value: "iOS" }],
                metricValues: [
                  { value: "600" },
                  { value: "0.5" },
                  { value: "300" },
                  { value: "0.5" },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await runAnalyticsFunnelReport("1234", funnelRequest, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1alpha/properties/1234:runFunnelReport",
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret-access-token",
    );
    expect(JSON.parse(String(init.body))).toEqual(funnelRequest);
    expect(response.funnelTable?.rows[0]?.dimensionValues[1]?.value).toBe(
      "RESERVED_TOTAL",
    );
  });

  it.each([
    [
      "a missing funnel table",
      { kind: "analyticsData#runFunnelReport" },
    ],
    [
      "a first dimension header that is not funnelStepName",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "platform" }],
          metricHeaders: [
            { name: "activeUsers" },
            { name: "funnelStepCompletionRate" },
            { name: "funnelStepAbandonments" },
            { name: "funnelStepAbandonmentRate" },
          ],
          rows: [],
        },
      },
    ],
    [
      "a breakdown header the request never asked for",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "funnelStepName" }, { name: "platform" }],
          metricHeaders: [
            { name: "activeUsers" },
            { name: "funnelStepCompletionRate" },
            { name: "funnelStepAbandonments" },
            { name: "funnelStepAbandonmentRate" },
          ],
          rows: [],
        },
      },
    ],
    [
      "a dropped funnel metric",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "funnelStepName" }],
          metricHeaders: [{ name: "activeUsers" }],
          rows: [],
        },
      },
    ],
    [
      "a row whose value count disagrees with the headers",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "funnelStepName" }],
          metricHeaders: [
            { name: "activeUsers" },
            { name: "funnelStepCompletionRate" },
            { name: "funnelStepAbandonments" },
            { name: "funnelStepAbandonmentRate" },
          ],
          rows: [{ dimensionValues: [{ value: "1. a" }], metricValues: [{ value: "1" }] }],
        },
      },
    ],
  ] as const)("rejects a funnel response with %s", async (_case, payload) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      runAnalyticsFunnelReport(
        "1234",
        {
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          funnel: {
            steps: [
              {
                name: "a",
                filterExpression: { funnelEventFilter: { eventName: "first_open" } },
              },
            ],
          },
        },
        { accessToken: "secret-access-token", fetchImpl },
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("reads property metadata over GET on v1beta and reuses the error taxonomy", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "properties/1234/metadata",
            dimensions: [
              { apiName: "platform", uiName: "Platform", customDefinition: false },
              {
                apiName: "customUser:account_type",
                uiName: "계정 유형",
                customDefinition: true,
              },
            ],
            metrics: [{ apiName: "activeUsers", uiName: "Active users" }],
            comparisons: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const metadata = await getAnalyticsMetadata("1234", {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/1234/metadata",
    );
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(metadata.dimensions.map(({ apiName }) => apiName)).toEqual([
      "platform",
      "customUser:account_type",
    ]);

    await expect(
      getAnalyticsMetadata("1234", {
        accessToken: "secret-access-token",
        fetchImpl,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "permission",
      }),
    );
  });

  it("accepts the implicit trailing dateRange header only when two ranges were requested", async () => {
    const payload = {
      dimensionHeaders: [{ name: "date" }, { name: "dateRange" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [
        {
          dimensionValues: [{ value: "20260901" }, { value: "current" }],
          metricValues: [{ value: "12" }],
        },
      ],
      rowCount: 1,
    };
    const twoRanges = {
      dateRanges: [
        { startDate: "28daysAgo", endDate: "yesterday", name: "current" },
        { startDate: "56daysAgo", endDate: "29daysAgo", name: "previous" },
      ],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    };
    const oneRange = {
      dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    };
    const respond = () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const accepted = await runAnalyticsReport("1234", twoRanges, {
      accessToken: "secret-access-token",
      fetchImpl: vi.fn().mockResolvedValue(respond()),
    });
    expect(accepted.dimensionHeaders.at(-1)?.name).toBe("dateRange");

    await expect(
      runAnalyticsReport("1234", oneRange, {
        accessToken: "secret-access-token",
        fetchImpl: vi.fn().mockResolvedValue(respond()),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("serializes a cohort request that carries no top-level dateRanges", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          dimensionHeaders: [{ name: "cohort" }, { name: "cohortNthWeek" }],
          metricHeaders: [
            { name: "cohortActiveUsers" },
            { name: "cohortTotalUsers" },
          ],
          rows: [
            {
              dimensionValues: [{ value: "2026-08-30" }, { value: "0000" }],
              metricValues: [{ value: "120" }, { value: "120" }],
            },
          ],
          rowCount: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const request = {
      dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
      metrics: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
      cohortSpec: {
        cohorts: [
          {
            name: "2026-08-30",
            dimension: "firstSessionDate" as const,
            dateRange: { startDate: "2026-08-30", endDate: "2026-09-05" },
          },
        ],
        cohortsRange: {
          granularity: "WEEKLY" as const,
          startOffset: 0,
          endOffset: 4,
        },
      },
      limit: 100,
      returnPropertyQuota: true,
    };

    await runAnalyticsReport("1234", request, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual(request);
    expect(body.dateRanges).toBeUndefined();
  });
});
