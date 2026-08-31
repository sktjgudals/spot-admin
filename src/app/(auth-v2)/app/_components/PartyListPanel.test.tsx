import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listParties: vi.fn(),
  listOperatorPartyPage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/parties",
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    admin: {
      role: "BUSINESS_ADMIN",
      businessId: "biz_a",
      name: "운영자",
      business: { name: "도파 라운지" },
    },
  }),
}));

vi.mock("@/auth/api/admin-party.api", () => ({
  listParties: mocks.listParties,
  listOperatorPartyPage: mocks.listOperatorPartyPage,
  partyQueryKeys: {
    list: (businessId: string, scope: string) => ["parties", businessId, scope],
  },
}));

import { BusinessPartyListPanel, partyTabFor } from "./BusinessPartyListPanel";

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <BusinessPartyListPanel
        businessId="biz_a"
        partyHref={(id) => `/app/parties/${id}`}
        createHref="/app/parties/new"
      />
    </QueryClientProvider>,
  );
}

function party(
  id: string,
  title: string,
  operationalStatus: "DRAFT" | "RECRUITING" | "LIVE" | "COMPLETED" = "DRAFT",
) {
  return {
    id,
    title,
    operationalStatus,
    startsAt: "2026-09-01T10:00:00.000Z",
    date: "2026-09-01T10:00:00.000Z",
    location: "서울 성수동",
    maxCapacity: 20,
    currentCount: 8,
    pendingApplicationCount: 2,
    coverImage: "https://media.dopa.ing/parties/cover.webp",
  };
}

function operatorPage(
  items: ReturnType<typeof party>[],
  nextCursor: string | null,
) {
  return { items, nextCursor };
}

describe("PartyListPanel business view", () => {
  beforeEach(() => {
    mocks.listParties.mockReset();
    mocks.listOperatorPartyPage.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ["DRAFT", "WAITING"],
    ["RECRUITING", "RECRUITING"],
    ["CONFIRMED", "RECRUITING"],
    ["CHECKIN_OPEN", "IN_PROGRESS"],
    ["LIVE", "IN_PROGRESS"],
    ["INTEREST_OPEN", "IN_PROGRESS"],
    ["INTEREST_CLOSED", "IN_PROGRESS"],
    ["MATCH_PENDING", "IN_PROGRESS"],
    ["MATCH_REVEALED", "IN_PROGRESS"],
    ["AFTER_PARTY", "IN_PROGRESS"],
    ["COMPLETED", "ENDED"],
    ["CANCELLED", "ENDED"],
  ] as const)("maps %s to the %s lifecycle tab", (status, expected) => {
    expect(partyTabFor(status)).toBe(expected);
  });

  it("offers an in-progress filter for active operational stages", async () => {
    mocks.listOperatorPartyPage.mockResolvedValue(operatorPage([], null));
    renderPanel();

    expect(await screen.findByRole("button", { name: "진행중" })).toBeInTheDocument();
  });

  it("keeps the primary greeting readable on narrow operator screens", async () => {
    mocks.listOperatorPartyPage.mockResolvedValue(operatorPage([], null));
    renderPanel();

    const greeting = await screen.findByRole("heading", {
      level: 1,
      name: "도파 라운지 관리자님, 안녕하세요",
    });
    expect(greeting).not.toHaveClass("truncate");
    expect(greeting).toHaveClass("text-balance");
  });

  it("announces only a concise list status instead of the whole card collection", async () => {
    mocks.listOperatorPartyPage.mockResolvedValue(
      operatorPage([party("party-1", "첫 페이지 파티")], null),
    );
    renderPanel();

    const list = await screen.findByRole("list", { name: "파티 목록" });
    expect(list.closest("[aria-live]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1개");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  });

  it("uses the high-contrast foreground token for an in-progress badge", async () => {
    mocks.listOperatorPartyPage.mockResolvedValue(
      operatorPage([party("party-live", "진행 중인 파티", "LIVE")], null),
    );
    renderPanel();

    const list = await screen.findByRole("list", { name: "파티 목록" });
    const badge = within(list).getByText("진행중");
    expect(badge).toHaveClass("text-foreground");
    expect(badge).not.toHaveClass("text-info");
  });

  it("announces the initial loading state without making skeletons live", () => {
    mocks.listOperatorPartyPage.mockReturnValue(new Promise<never>(() => undefined));
    renderPanel();

    expect(screen.getByRole("status")).toHaveTextContent(
      "파티 목록 불러오는 중",
    );
    expect(
      screen.getByLabelText("파티 목록을 불러오는 중").closest("[aria-live]"),
    ).toBeNull();
  });

  it("announces a load failure and lets the operator retry", async () => {
    mocks.listOperatorPartyPage
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(operatorPage([], null));
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "파티 목록을 불러오지 못했습니다",
    );
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("아직 등록한 파티가 없어요.")).toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(2);
  });

  it("keeps one cursor page in the DOM and moves focus in both directions", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      party(
        `party-first-${index + 1}`,
        `첫 페이지 파티 ${String(index + 1).padStart(2, "0")}`,
      ),
    );
    const secondPage = Array.from({ length: 50 }, (_, index) =>
      party(
        `party-second-${index + 1}`,
        `두 번째 페이지 파티 ${String(index + 1).padStart(2, "0")}`,
      ),
    );
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(
        operatorPage(firstPage, "opaque/cursor+2"),
      )
      .mockResolvedValueOnce(operatorPage(secondPage, null));
    const user = userEvent.setup();
    const view = renderPanel();

    expect(await screen.findByText("첫 페이지 파티 01")).toBeInTheDocument();
    const initialList = screen.getByRole("list", { name: "파티 목록" });
    expect(within(initialList).getAllByRole("listitem")).toHaveLength(50);
    expect(initialList.getElementsByTagName("img")).toHaveLength(50);
    const cover = view.container.querySelector("img[src*='cover.webp']");
    expect(cover).toHaveAttribute("loading", "lazy");
    expect(cover?.closest("li")).toHaveClass("min-w-0");
    expect(cover).toHaveAttribute(
      "src",
      "https://media.dopa.ing/t/width=320,quality=72,format=webp,fit=scale-down/parties/cover.webp",
    );
    await user.click(screen.getByRole("button", { name: "파티 더 보기" }));

    const nextPageParty = await screen.findByRole("link", {
      name: /두 번째 페이지 파티 01/u,
    });
    await waitFor(() => expect(nextPageParty).toHaveFocus());
    const nextList = screen.getByRole("list", { name: "파티 목록" });
    expect(within(nextList).getAllByRole("listitem")).toHaveLength(50);
    expect(nextList.getElementsByTagName("img")).toHaveLength(50);
    expect(screen.queryByText("첫 페이지 파티 01")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "이전 파티" }));

    const previousPageParty = await screen.findByRole("link", {
      name: /첫 페이지 파티 01/u,
    });
    await waitFor(() => expect(previousPageParty).toHaveFocus());
    expect(screen.queryByText("두 번째 페이지 파티 01")).not.toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenNthCalledWith(1, "biz_a", {
      lifecycle: "ALL",
      limit: 50,
      cursor: undefined,
    });
    expect(mocks.listOperatorPartyPage).toHaveBeenNthCalledWith(2, "biz_a", {
      lifecycle: "ALL",
      limit: 50,
      cursor: "opaque/cursor+2",
    });
  });

  it("restores the current cursor page independently for each status filter", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(
        operatorPage([party("all-1", "전체 첫 페이지")], "all-cursor-2"),
      )
      .mockResolvedValueOnce(
        operatorPage([party("all-2", "전체 두 번째 페이지")], null),
      )
      .mockResolvedValueOnce(
        operatorPage([party("ended-1", "종료 페이지", "COMPLETED")], null),
      );
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("전체 첫 페이지");
    await user.click(screen.getByRole("button", { name: "파티 더 보기" }));
    const allSecondPage = await screen.findByRole("link", {
      name: /전체 두 번째 페이지/u,
    });
    expect(allSecondPage).toHaveAttribute("href", "/app/parties/all-2");

    await user.click(screen.getByRole("button", { name: "종료" }));
    expect(await screen.findByText("종료 페이지")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "전체" }));

    expect(
      await screen.findByRole("link", { name: /전체 두 번째 페이지/u }),
    ).toHaveAttribute("href", "/app/parties/all-2");
    expect(screen.queryByText("전체 첫 페이지")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(3);
  });

  it("keeps loaded parties and moves focus through cursor failure and retry", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(
        operatorPage([party("party-1", "첫 페이지 파티")], "cursor-2"),
      )
      .mockRejectedValueOnce(new Error("next page unavailable"))
      .mockResolvedValueOnce(
        operatorPage([party("party-2", "복구된 두 번째 파티")], null),
      );
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText("첫 페이지 파티")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "파티 더 보기" }));

    const retry = await screen.findByRole("button", {
      name: "다음 페이지 다시 시도",
    });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByText("첫 페이지 파티")).toBeInTheDocument();

    await user.click(retry);
    const recoveredParty = await screen.findByRole("link", {
      name: /복구된 두 번째 파티/u,
    });
    await waitFor(() => expect(recoveredParty).toHaveFocus());
    expect(screen.queryByText("첫 페이지 파티")).not.toBeInTheDocument();
  });

  it("retains a current party focus target when a terminal cursor page is empty", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(
        operatorPage([party("party-1", "유지되는 파티")], "cursor-2"),
      )
      .mockResolvedValueOnce(operatorPage([], null));
    const user = userEvent.setup();
    renderPanel();

    const retainedParty = await screen.findByRole("link", {
      name: /유지되는 파티/u,
    });
    await user.click(screen.getByRole("button", { name: "파티 더 보기" }));

    await waitFor(() => expect(retainedParty).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("uses the server lifecycle bucket when an operator changes tabs", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(operatorPage([party("party-1", "대기 파티")], null))
      .mockResolvedValueOnce(
        operatorPage([party("party-2", "종료 파티", "COMPLETED")], null),
      );
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText("대기 파티")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "종료" }));

    expect(await screen.findByText("종료 파티")).toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenLastCalledWith("biz_a", {
      lifecycle: "CLOSED",
      limit: 50,
      cursor: undefined,
    });
  });

  it("keeps paging an OPEN bucket until the selected detailed status is found", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(operatorPage([], null))
      .mockResolvedValueOnce(
        operatorPage(
          [party("party-live", "진행 중인 파티", "LIVE")],
          "next-open-page",
        ),
      )
      .mockResolvedValueOnce(
        operatorPage(
          [party("party-recruiting", "모집 중인 파티", "RECRUITING")],
          null,
        ),
      );
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("아직 등록한 파티가 없어요.");
    await user.click(screen.getByRole("button", { name: "모집중" }));

    expect(await screen.findByText("모집 중인 파티")).toBeInTheDocument();
    expect(screen.queryByText("아직 등록한 파티가 없어요.")).not.toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenNthCalledWith(3, "biz_a", {
      lifecycle: "OPEN",
      limit: 50,
      cursor: "next-open-page",
    });
  });

  it("bounds an empty detailed OPEN scan and lets the operator continue deliberately", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(operatorPage([], null))
      .mockResolvedValueOnce(
        operatorPage([party("live-1", "진행 파티 1", "LIVE")], "open-2"),
      )
      .mockResolvedValueOnce(
        operatorPage([party("live-2", "진행 파티 2", "LIVE")], "open-3"),
      )
      .mockResolvedValueOnce(
        operatorPage([party("live-3", "진행 파티 3", "LIVE")], "open-4"),
      )
      .mockResolvedValueOnce(
        operatorPage([party("recruiting", "뒤에서 찾은 모집 파티", "RECRUITING")], null),
      );
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("아직 등록한 파티가 없어요.");
    await user.click(screen.getByRole("button", { name: "모집중" }));

    expect(
      await screen.findByText(/먼저 불러온 최대 150건에서 모집중 파티를 찾지 못했습니다/u),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(4));

    await user.click(screen.getByRole("button", { name: "다음 50건에서 계속 찾기" }));
    expect(await screen.findByText("뒤에서 찾은 모집 파티")).toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(5);
  });
});
