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
  fetchAnalyticsCapabilities: vi.fn(),
}));

vi.mock("./charts/TrendChart", () => ({
  default: ({
    metric,
    showPrevious,
  }: {
    metric: string;
    showPrevious: boolean;
  }) => (
    <div
      data-testid="trend-chart"
      data-metric={metric}
      data-show-previous={String(showPrevious)}
    />
  ),
}));

import {
  loadGoogleAnalyticsIdentityServices,
  requestGoogleAnalyticsToken,
} from "./google-analytics-oauth";
import {
  fetchAnalyticsCapabilities,
  fetchAnalyticsReport,
} from "./analytics-reports";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const properties = [
  { id: "1234", label: "Dopa Web", platform: "web" as const },
  { id: "5678", label: "Dopa App", platform: "mixed" as const },
];

function emptyOverview(): AnalyticsReportResult {
  return {
    view: "overview",
    metrics: [],
    series: { points: [] },
    platforms: [],
    insights: [],
    currencyCode: "KRW",
    quota: null,
    dataQualityNotices: [],
    isEmpty: true,
  };
}

function funnelResult(
  overrides: Partial<Extract<AnalyticsReportResult, { view: "funnel" }>> = {},
): AnalyticsReportResult {
  return {
    view: "funnel",
    funnelId: "party-apply",
    title: "파티 신청",
    description: "파티 상세에서 신청 완료까지의 단계별 이탈입니다.",
    steps: [
      {
        index: 0,
        name: "파티 상세",
        users: 1000,
        completionRate: null,
        abandonments: null,
        abandonmentRate: null,
        shareOfFirst: 1,
      },
    ],
    breakdown: null,
    currencyCode: "KRW",
    quota: null,
    dataQualityNotices: [],
    isEmpty: false,
    ...overrides,
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
    vi.mocked(fetchAnalyticsCapabilities).mockReset();
    vi.mocked(fetchAnalyticsCapabilities).mockResolvedValue({
      accountTypeDimension: true,
      customDimensions: ["customUser:account_type"],
    });
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
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) => {
      if (view === "overview") return emptyOverview();
      // This test only ever clicks a table-shaped view
      // (acquisition/engagement/conversion-revenue/realtime); the funnel and
      // retention tabs have their own test below.
      return {
        view: view as "acquisition" | "engagement" | "conversion-revenue" | "realtime",
        tables: [],
        metrics: [],
        currencyCode: "KRW",
        quota: null,
        dataQualityNotices: [],
        isEmpty: true,
      };
    });
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
    // The invariant is that report content never lands inside *any* live
    // region. Counting one status only held while QuotaBanner rendered
    // nothing, so assert it of every status on screen instead.
    expect(screen.getAllByRole("status")).toContain(completionStatus);
    for (const status of screen.getAllByRole("status")) {
      expect(status).not.toHaveTextContent("Organic Search");
    }
  });

  it("draws the selected trend metric and compares the previous period on request", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      view: "overview",
      metrics: [
        { key: "sessions", label: "세션", value: 15, previousValue: 12, format: "integer" },
      ],
      series: {
        points: [
          {
            date: "20260830",
            previousDate: "20260802",
            current: { activeUsers: 12, newUsers: 4, sessions: 15 },
            previous: { activeUsers: 9, newUsers: 3, sessions: 11 },
          },
        ],
      },
      platforms: [],
      insights: [
        {
          id: "total:sessions",
          severity: "positive",
          text: "세션 25% 증가 (12 → 15)",
          metric: "sessions",
          scope: "total",
          delta: 25,
          current: 15,
          previous: 12,
        },
      ],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: false,
    });
    renderDashboard();

    const chart = await screen.findByTestId("trend-chart");
    expect(chart).toHaveAttribute("data-metric", "activeUsers");
    expect(chart).toHaveAttribute("data-show-previous", "true");
    expect(screen.getByRole("heading", { name: "인사이트 요약" })).toBeInTheDocument();
    expect(screen.getByText("세션 25% 증가 (12 → 15)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "신규 사용자" }));
    expect(await screen.findByTestId("trend-chart")).toHaveAttribute(
      "data-metric",
      "newUsers",
    );

    await user.click(screen.getByLabelText("이전 기간 비교"));
    expect(await screen.findByTestId("trend-chart")).toHaveAttribute(
      "data-show-previous",
      "false",
    );
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

  it("keeps the Google token when the analytics route unmounts so a sibling screen can reuse it", () => {
    setAnalyticsAccessToken({ accessToken: "session-scoped", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    const { unmount } = renderDashboard();

    unmount();

    // Route-scoped clearing meant every screen that shows GA data re-opened the
    // Google consent popup. The token's life is the admin session's now.
    expect(getAnalyticsAccessToken()).toBe("session-scoped");
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

  it("adds funnel and retention tabs that fetch their own views", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) => {
      if (view === "funnel") {
        return {
          view: "funnel",
          funnelId: "party-apply",
          title: "파티 신청",
          description: "파티 상세에서 신청 완료까지의 단계별 이탈입니다.",
          steps: [
            {
              index: 0,
              name: "파티 상세",
              users: 1000,
              completionRate: 0.4,
              abandonments: 600,
              abandonmentRate: 0.6,
              shareOfFirst: 1,
            },
            {
              index: 1,
              name: "신청 화면",
              users: 400,
              completionRate: null,
              abandonments: null,
              abandonmentRate: null,
              shareOfFirst: 0.4,
            },
          ],
          breakdown: null,
          currencyCode: "KRW",
          quota: null,
          dataQualityNotices: [],
          isEmpty: false,
        };
      }
      if (view === "retention") {
        return {
          view: "retention",
          granularity: "WEEKLY",
          horizon: 4,
          cohorts: [
            {
              name: "2026-08-30",
              startDate: "2026-08-30",
              endDate: "2026-09-05",
              totalUsers: 120,
              cells: [
                { week: 0, activeUsers: 120, rate: 1, state: "complete" },
                { week: 1, activeUsers: 30, rate: 0.25, state: "partial" },
                { week: 2, activeUsers: 0, rate: 0, state: "future" },
                { week: 3, activeUsers: 0, rate: 0, state: "future" },
                { week: 4, activeUsers: 0, rate: 0, state: "future" },
              ],
            },
          ],
          currencyCode: "KRW",
          quota: null,
          dataQualityNotices: [],
          isEmpty: false,
        };
      }
      return emptyOverview();
    });
    renderDashboard();

    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");

    await user.click(screen.getByRole("button", { name: "퍼널" }));
    expect(await screen.findByLabelText("퍼널")).toBeInTheDocument();
    expect(screen.getByText("1. 파티 상세")).toBeInTheDocument();
    expect(fetchAnalyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({ view: "funnel", funnelId: "party-apply" }),
    );

    await user.click(screen.getByRole("button", { name: "리텐션" }));
    expect(
      await screen.findByRole("columnheader", { name: "코호트 시작일" }),
    ).toBeInTheDocument();
    expect(fetchAnalyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({ view: "retention" }),
    );
  });

  it("fixes the retention window and says so instead of offering a dead selector", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      view: "retention",
      granularity: "WEEKLY",
      horizon: 4,
      cohorts: [],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: true,
    });
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "리텐션" }));

    expect(await screen.findByText("리텐션은 최근 6주 코호트 고정")).toBeInTheDocument();
    expect(screen.getByLabelText("비교 기간")).toBeDisabled();
  });

  it("threads a platform chip into the report request and keeps the old table visible", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    // The first property is web-only, so it offers no platform chips.
    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");
    expect(screen.queryByRole("button", { name: "iOS" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("GA4 속성"), "5678");
    await user.click(await screen.findByRole("button", { name: "iOS" }));

    expect(fetchAnalyticsReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: { platforms: ["iOS"], accountType: "all" },
      }),
    );
    expect(screen.getByText("필터 1개 적용 중")).toBeInTheDocument();
  });

  it("disables the account-type filter and names the missing custom definition", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsCapabilities).mockResolvedValue({
      accountTypeDimension: false,
      customDimensions: [],
    });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    expect(
      await screen.findByText(
        "GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("계정 유형")).toBeDisabled();
  });

  it("warns above the tabs once the hourly pool drops below a tenth", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) => {
      if (view !== "overview") return new Promise<never>(() => {});
      return {
        ...emptyOverview(),
        quota: {
          category: "core",
          entries: [{ key: "tokensPerHour", consumed: 39_000, remaining: 1_000 }],
        },
      };
    });
    renderDashboard();

    expect(
      await screen.findByText(
        "GA API 시간당 할당량이 10% 미만입니다. 퍼널·리텐션은 토큰을 많이 소비합니다.",
      ),
    ).toBeInTheDocument();

    // Each view spends a different pool, so a reading never outlives the
    // report that produced it — not even for the length of the next load.
    await user.click(screen.getByRole("button", { name: "유입" }));

    expect(
      screen.queryByText(
        "GA API 시간당 할당량이 10% 미만입니다. 퍼널·리텐션은 토큰을 많이 소비합니다.",
      ),
    ).not.toBeInTheDocument();
  });

  it("resets the filters and the funnel selection when the property changes", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) =>
      view === "funnel" ? funnelResult() : emptyOverview(),
    );
    renderDashboard();

    await user.selectOptions(screen.getByLabelText("GA4 속성"), "5678");
    await user.click(await screen.findByRole("button", { name: "iOS" }));
    await user.click(screen.getByRole("button", { name: "퍼널" }));
    await user.selectOptions(await screen.findByLabelText("퍼널"), "party-payment");
    await user.click(screen.getByLabelText("플랫폼별 보기"));

    expect(fetchAnalyticsReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: { platforms: ["iOS"], accountType: "all" },
        funnelId: "party-payment",
        funnelBreakdown: true,
      }),
    );

    await user.selectOptions(screen.getByLabelText("GA4 속성"), "1234");

    expect(fetchAnalyticsReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        property: properties[0],
        filters: { platforms: [], accountType: "all" },
        funnelId: "party-apply",
        funnelBreakdown: false,
      }),
    );
    expect(screen.queryByText("필터 1개 적용 중")).not.toBeInTheDocument();
  });

  it("holds the previous table on screen while a filter change is in flight", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view, filters }) => {
      if (view === "overview") return emptyOverview();
      // The filtered request never settles, so the placeholder state is the
      // one under test.
      if (filters.platforms.length > 0) return new Promise<never>(() => {});
      return {
        view: "acquisition",
        metrics: [],
        tables: [
          {
            key: "channels",
            title: "채널",
            description: "유입 채널",
            columns: [
              { key: "channel", label: "채널", kind: "dimension" },
              { key: "sessions", label: "세션", kind: "metric", format: "integer" },
            ],
            rows: [{ channel: "Organic Search", sessions: "10" }],
            totalRowCount: 1,
          },
        ],
        currencyCode: "KRW",
        quota: null,
        dataQualityNotices: [],
        isEmpty: false,
      };
    });
    renderDashboard();

    await user.selectOptions(screen.getByLabelText("GA4 속성"), "5678");
    await user.click(screen.getByRole("button", { name: "유입" }));
    await screen.findByText("Organic Search");

    await user.click(screen.getByRole("button", { name: "iOS" }));

    const busy = await screen.findByRole("status", { name: "필터 적용 중" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveTextContent(
      "필터 적용 중입니다. 이전 결과를 표시하고 있습니다.",
    );
    // No skeleton flash: the row an operator was reading is still there.
    expect(screen.getByText("Organic Search")).toBeInTheDocument();
  });

  it("does not read property metadata before there is anything to read it for", async () => {
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    expect(
      await screen.findByRole("button", { name: "Google Analytics 연결" }),
    ).toBeInTheDocument();
    expect(fetchAnalyticsCapabilities).not.toHaveBeenCalled();

    cleanup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    renderDashboard({ properties: [], configError: "GA4 속성이 설정되지 않았습니다." });

    expect(
      await screen.findByRole("heading", { name: "분석 설정 필요" }),
    ).toBeInTheDocument();
    expect(fetchAnalyticsCapabilities).not.toHaveBeenCalled();
  });

  it("names the funnel's own token pool in the quota footer", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) =>
      view === "funnel"
        ? funnelResult({
            quota: {
              category: "funnel",
              entries: [{ key: "tokensPerHour", consumed: 10, remaining: 90 }],
            },
          })
        : emptyOverview(),
    );
    renderDashboard();

    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");
    await user.click(screen.getByRole("button", { name: "퍼널" }));

    expect(
      await screen.findByText("GA API 할당량 상태 · 퍼널(별도 풀)"),
    ).toBeInTheDocument();
  });

  it("closes only the tab whose pool actually refused a request", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) => {
      if (view === "funnel") {
        throw new AnalyticsDataApiError("quota", "quota", { status: 429 });
      }
      return emptyOverview();
    });
    renderDashboard();

    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");
    await user.click(screen.getByRole("button", { name: "퍼널" }));
    await screen.findByRole("heading", {
      name: "GA API 할당량을 모두 사용했습니다.",
    });

    await user.click(screen.getByRole("button", { name: "개요" }));
    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");

    expect(screen.getByRole("button", { name: "퍼널" })).toBeDisabled();
    // The Core pool never refused anything, so its tabs stay open.
    expect(screen.getByRole("button", { name: "유입" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "리텐션" })).toBeEnabled();
  });
});
