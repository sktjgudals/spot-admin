import { describe, expect, it, vi } from "vitest";
import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
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
});
