import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsDataApiError } from "./analytics-data-api";
import {
  __resetAnalyticsTokenForTests,
  getAnalyticsAccessToken,
  setAnalyticsAccessToken,
} from "./analytics-token-store";
import type { AnalyticsReportResult } from "./types";

vi.mock("./google-analytics-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-analytics-oauth")>();
  return {
    ...actual,
    loadGoogleAnalyticsIdentityServices: vi.fn().mockResolvedValue(undefined),
    requestGoogleAnalyticsToken: vi.fn(),
  };
});

vi.mock("./analytics-reports", () => ({
  fetchAnalyticsReport: vi.fn(),
}));

import {
  loadGoogleAnalyticsIdentityServices,
  requestGoogleAnalyticsToken,
} from "./google-analytics-oauth";
import { fetchAnalyticsReport } from "./analytics-reports";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const properties = [
  { id: "1234", label: "Dopa Web", platform: "web" as const },
  { id: "5678", label: "Dopa App", platform: "mixed" as const },
];

function emptyOverview(): AnalyticsReportResult {
  return {
    view: "overview",
    metrics: [],
    trend: [],
    currencyCode: "KRW",
    quota: null,
    dataQualityNotices: [],
    isEmpty: true,
  };
}

function renderDashboard(overrides: Partial<React.ComponentProps<typeof AnalyticsDashboard>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsDashboard
        properties={properties}
        googleClientId="public-client-id"
        configError={null}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe("AnalyticsDashboard", () => {
  beforeEach(() => {
    __resetAnalyticsTokenForTests();
    vi.mocked(fetchAnalyticsReport).mockReset();
    vi.mocked(requestGoogleAnalyticsToken).mockReset();
    vi.mocked(loadGoogleAnalyticsIdentityServices).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders a configuration state without offering a broken connection", () => {
    renderDashboard({ properties: [], configError: "GA4 속성이 설정되지 않았습니다." });

    expect(screen.getByRole("heading", { name: "분석 설정 필요" })).toBeInTheDocument();
    expect(screen.getByText("GA4 속성이 설정되지 않았습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google Analytics 연결" })).not.toBeInTheDocument();
  });

  it("waits for an explicit connection and then shows the empty state", async () => {
    const user = userEvent.setup();
    vi.mocked(requestGoogleAnalyticsToken).mockResolvedValue({
      accessToken: "memory-only-token",
      expiresInSeconds: 3600,
    });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    expect(fetchAnalyticsReport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Google Analytics 연결" }));

    expect(await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.")).toBeInTheDocument();
    expect(fetchAnalyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({
        view: "overview",
        property: properties[0],
        accessToken: "memory-only-token",
      }),
    );
  });

  it("fetches only the selected view and property", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) =>
      view === "overview"
        ? emptyOverview()
        : {
            view,
            tables: [],
            metrics: [],
            currencyCode: "KRW",
            quota: null,
            dataQualityNotices: [],
            isEmpty: true,
          },
    );
    renderDashboard();

    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");
    await user.selectOptions(screen.getByLabelText("GA4 속성"), "5678");
    const acquisitionView = screen.getByRole("button", { name: "유입" });
    expect(acquisitionView).toHaveAttribute("aria-pressed", "false");
    await user.click(acquisitionView);
    expect(acquisitionView).toHaveAttribute("aria-pressed", "true");

    expect(fetchAnalyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({
        view: "acquisition",
        property: properties[1],
      }),
    );
  });

  it("announces selector loading and one concise completion summary without reading the result table", async () => {
    const user = userEvent.setup();
    let resolveAcquisition!: (result: AnalyticsReportResult) => void;
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport)
      .mockResolvedValueOnce(emptyOverview())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAcquisition = resolve;
          }),
      );
    renderDashboard();

    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");
    await user.click(screen.getByRole("button", { name: "유입" }));

    const loading = screen.getByRole("status", {
      name: "Google Analytics 보고서 로딩 중",
    });
    expect(loading).toHaveAttribute("aria-live", "polite");
    expect(loading).toHaveAttribute("aria-atomic", "true");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent(
      "Google Analytics 보고서를 불러오는 중입니다.",
    );

    await act(async () => {
      resolveAcquisition({
        view: "acquisition",
        metrics: [],
        tables: [
          {
            key: "channels",
            title: "채널",
            description: "유입 채널",
            columns: [
              { key: "channel", label: "채널", kind: "dimension" },
              {
                key: "sessions",
                label: "세션",
                kind: "metric",
                format: "integer",
              },
            ],
            rows: [{ channel: "Organic Search", sessions: "10" }],
            totalRowCount: 1,
          },
        ],
        currencyCode: "KRW",
        quota: null,
        dataQualityNotices: [],
        isEmpty: false,
      });
      await Promise.resolve();
    });

    const summary = await screen.findByText(
      "Dopa Web 유입 보고서를 불러왔습니다. 표 1개, 행 1개가 표시됩니다.",
    );
    const completionStatus = summary.closest('[role="status"]');
    expect(completionStatus).toHaveAttribute("aria-live", "polite");
    expect(completionStatus).toHaveAttribute("aria-atomic", "true");
    expect(completionStatus).toHaveTextContent(summary.textContent ?? "");
    expect(completionStatus).not.toHaveTextContent("Organic Search");
    expect(screen.getByText("Organic Search")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("labels the overview visualization as a session-only daily trend", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      view: "overview",
      metrics: [
        { key: "sessions", label: "세션", value: 15, previousValue: 12, format: "integer" },
      ],
      trend: [{ date: "20260830", activeUsers: "12", sessions: "15", keyEvents: "2" }],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: false,
    });
    renderDashboard();

    expect(await screen.findByText("세션의 일별 변화입니다.")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "일별 세션 추이" })).toBeInTheDocument();
  });

  it("distinguishes displayed top rows from the GA4 total and surfaces data-quality limits", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      view: "acquisition",
      metrics: [],
      tables: [
        {
          key: "channels",
          title: "채널·소스·캠페인",
          description: "세션 기준 유입 경로입니다.",
          columns: [
            { key: "channel", label: "채널", kind: "dimension" },
            { key: "sessions", label: "세션", kind: "metric", format: "integer" },
          ],
          rows: [
            { channel: "Organic Search", sessions: "100" },
            { channel: "Direct", sessions: "80" },
          ],
          totalRowCount: 175,
        },
      ],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [
        {
          kind: "thresholding",
          reportKey: "channels",
          reportTitle: "채널·소스·캠페인",
        },
        {
          kind: "sampling",
          reportKey: "channels",
          reportTitle: "채널·소스·캠페인",
          samplesReadCount: "12500",
          samplingSpaceSize: "50000",
        },
        {
          kind: "other-row",
          reportKey: "channels",
          reportTitle: "채널·소스·캠페인",
        },
      ],
      isEmpty: false,
    });
    renderDashboard();

    expect(await screen.findByText("상위 2개 표시 · 전체 175개 결과")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "데이터 품질 안내" })).toBeInTheDocument();
    expect(screen.getByText(/개인정보 보호 임계값/)).toBeInTheDocument();
    expect(screen.getByText(/25\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/\(other\) 행/)).toBeInTheDocument();
  });

  it("keeps GA4 quality warnings visible when thresholding leaves an empty report", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      ...emptyOverview(),
      dataQualityNotices: [
        {
          kind: "thresholding",
          reportKey: "current-summary",
          reportTitle: "현재 기간 핵심 지표",
        },
      ],
    });
    renderDashboard();

    expect(
      await screen.findByText("선택한 기간에 표시할 수 있는 데이터가 없습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("선택한 기간에 수집된 데이터가 없습니다."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "데이터 품질 안내" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "개인정보 보호 임계값이 적용되어 소규모 사용자 행이 제외되었을 수 있습니다.",
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it.each([
    [
      new AnalyticsDataApiError("permission", "forbidden", { status: 403 }),
      "GA4 속성 권한이 없습니다.",
    ],
    [
      new AnalyticsDataApiError("quota", "quota", { status: 429, retryAfterMs: 2000 }),
      "GA API 할당량을 모두 사용했습니다.",
    ],
  ] as const)("renders an explicit API error state", async (error, message) => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockRejectedValue(error);
    renderDashboard();

    expect(await screen.findByRole("heading", { name: message })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("clears cached reporting data and explains token expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T00:00:00.000Z"));
    setAnalyticsAccessToken({ accessToken: "short-lived", expiresInSeconds: 60 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(
      screen.getByRole("heading", { name: "Google Analytics 연결이 만료되었습니다." }),
    ).toBeInTheDocument();
  });

  it("clears the Google token when the protected analytics route unmounts", () => {
    setAnalyticsAccessToken({ accessToken: "route-scoped", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    const { unmount } = renderDashboard();

    unmount();

    expect(getAnalyticsAccessToken()).toBeNull();
  });

  it("discards an OAuth grant that arrives after the analytics route unmounts", async () => {
    const user = userEvent.setup();
    let resolveGrant: ((grant: { accessToken: string; expiresInSeconds: number }) => void) | null = null;
    vi.mocked(requestGoogleAnalyticsToken).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGrant = resolve;
        }),
    );
    const { unmount } = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Google Analytics 연결" }));
    unmount();
    await act(async () => {
      if (!resolveGrant) throw new Error("OAuth request was not started");
      resolveGrant({ accessToken: "late-token", expiresInSeconds: 3600 });
      await Promise.resolve();
    });

    expect(getAnalyticsAccessToken()).toBeNull();
  });
});
