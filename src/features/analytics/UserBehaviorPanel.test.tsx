import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsDataApiError } from "./analytics-data-api";
import {
  __resetAnalyticsTokenForTests,
  getAnalyticsAccessToken,
  setAnalyticsAccessToken,
} from "./analytics-token-store";

vi.mock("./google-analytics-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-analytics-oauth")>();
  return {
    ...actual,
    loadGoogleAnalyticsIdentityServices: vi.fn().mockResolvedValue(undefined),
    requestGoogleAnalyticsToken: vi.fn(),
  };
});

vi.mock("./user-behavior-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./user-behavior-report")>();
  return { ...actual, fetchUserBehaviorFlow: vi.fn() };
});

import { requestGoogleAnalyticsToken } from "./google-analytics-oauth";
import {
  fetchUserBehaviorFlow,
  shapeUserBehaviorRows,
  type UserBehaviorFlow,
  type UserBehaviorRow,
} from "./user-behavior-report";
import { UserBehaviorPanel } from "./UserBehaviorPanel";

const properties = [
  { id: "1234", label: "Dopa Web", platform: "web" as const },
  { id: "5678", label: "Dopa App", platform: "mixed" as const },
];

function emptyFlow(overrides: Partial<UserBehaviorFlow> = {}): UserBehaviorFlow {
  return {
    timeZone: "Asia/Seoul",
    sessions: [],
    totals: { sessions: 0, events: 0, screenViews: 0 },
    dataQualityNotices: [],
    quota: null,
    rowCount: 0,
    truncated: false,
    isEmpty: true,
    ...overrides,
  };
}

function row(
  dateHourMinute: string,
  eventName: string,
  unifiedScreenName: string,
  eventCount = 1,
): UserBehaviorRow {
  return {
    dateHourMinute,
    eventName,
    unifiedScreenName,
    platform: "iOS",
    eventCount,
  };
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof UserBehaviorPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserBehaviorPanel
        userId="user-1"
        nickname="민정"
        properties={properties}
        googleClientId="public-client-id"
        configError={null}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe("UserBehaviorPanel", () => {
  beforeEach(() => {
    __resetAnalyticsTokenForTests();
    vi.mocked(fetchUserBehaviorFlow).mockReset();
    vi.mocked(requestGoogleAnalyticsToken).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("says what is missing instead of offering a connection that cannot work", () => {
    renderPanel({ properties: [], configError: "GA4 속성이 설정되지 않았습니다." });

    expect(screen.getByRole("heading", { name: "GA4 설정 필요" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Google Analytics 연결" }),
    ).not.toBeInTheDocument();
    expect(fetchUserBehaviorFlow).not.toHaveBeenCalled();
  });

  it("asks for an explicit connection before touching Google", async () => {
    const user = userEvent.setup();
    vi.mocked(requestGoogleAnalyticsToken).mockResolvedValue({
      accessToken: "memory-only-token",
      expiresInSeconds: 3600,
    });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(emptyFlow());
    renderPanel();

    expect(fetchUserBehaviorFlow).not.toHaveBeenCalled();
    expect(screen.getByText("analytics.readonly만 요청")).toBeInTheDocument();
    expect(
      screen.getByText("이 탭의 메모리에만 유지 · 로그아웃 시 삭제"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Google Analytics 연결" }));

    expect(await screen.findByText("아직 수집된 행동이 없어요")).toBeInTheDocument();
    // The app property, not the web one, and this user only.
    expect(fetchUserBehaviorFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        property: properties[1],
        userId: "user-1",
        range: "7d",
        accessToken: "memory-only-token",
      }),
    );
  });

  it("names the unregistered GA4 custom dimension instead of reporting a bad request", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockRejectedValue(
      new AnalyticsDataApiError("unknown-field", "no such dimension", {
        status: 400,
        apiMessage: "Field customUser:dopa_uid is not a valid dimension.",
      }),
    );
    renderPanel();

    expect(
      await screen.findByRole("heading", {
        name: "GA4에 사용자 식별 측정기준이 아직 없어요",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/맞춤 측정기준 만들기/)).toBeInTheDocument();
    expect(screen.getByText(/dopa_uid/)).toBeInTheDocument();
  });

  it("keeps the threshold warning visible when GA4 returns nothing", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(
      emptyFlow({
        dataQualityNotices: [
          {
            kind: "thresholding",
            reportKey: "user-behavior",
            reportTitle: "사용자 행동 흐름",
          },
        ],
      }),
    );
    renderPanel();

    expect(await screen.findByText("아직 수집된 행동이 없어요")).toBeInTheDocument();
    expect(screen.getByText(/임계값 때문에 표시되지 않을 수 있어요/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "데이터 품질 안내" }),
    ).toBeInTheDocument();
  });

  it("renders each session as a screen-by-screen flow with event chips", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(
      shapeUserBehaviorRows(
        [
          row("202609080930", "screen_view", "PartyDetail"),
          row("202609080931", "api_mutation", "PartyDetail", 2),
          row("202609080933", "screen_view", "Payment"),
        ],
        {
          timeZone: "Asia/Seoul",
          quota: null,
          dataQualityNotices: [],
          rowCount: 3,
          truncated: true,
        },
      ),
    );
    renderPanel();

    expect(await screen.findByText("PartyDetail")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("09:30–09:33")).toBeInTheDocument();
    expect(screen.getByText("지속 3분")).toBeInTheDocument();
    // Both screen visits carry one screen_view, so the chip text repeats.
    expect(screen.getAllByText("화면 조회 × 1")).toHaveLength(2);
    expect(screen.getByText("데이터 변경 × 2")).toBeInTheDocument();
    expect(screen.getByText(/최근 일부만 표시했습니다/)).toBeInTheDocument();
    expect(
      screen.getByText(/Asia\/Seoul 기준, GA4 처리 지연으로 최근 24–48시간은 누락될 수 있어요/),
    ).toBeInTheDocument();
  });

  it("re-queries when the operator widens the range", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(emptyFlow());
    renderPanel();

    await screen.findByText("아직 수집된 행동이 없어요");
    const twentyEight = screen.getByRole("button", { name: "최근 28일" });
    expect(twentyEight).toHaveAttribute("aria-pressed", "false");

    await user.click(twentyEight);

    expect(twentyEight).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(fetchUserBehaviorFlow).toHaveBeenLastCalledWith(
        expect.objectContaining({ range: "28d" }),
      ),
    );
  });

  it("drops the stale grant when Google says the token expired", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockRejectedValue(
      new AnalyticsDataApiError("expired", "Google Analytics 연결이 만료되었습니다.", {
        status: 401,
      }),
    );
    renderPanel();

    expect(
      await screen.findByRole("heading", {
        name: "Google Analytics 연결이 만료되었습니다.",
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getAnalyticsAccessToken()).toBeNull());
  });
});
