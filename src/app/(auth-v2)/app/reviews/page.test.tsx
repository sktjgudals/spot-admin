import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOperatorPartyPage: vi.fn(),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    admin: {
      role: "BUSINESS_ADMIN",
      businessId: "biz-a",
      name: "운영자",
    },
  }),
}));

vi.mock("@/auth/api/admin-party.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-party.api")>();
  return {
    ...actual,
    listOperatorPartyPage: mocks.listOperatorPartyPage,
  };
});

vi.mock("@/components/business-mobile/BusinessMobileNavigation", () => ({
  BusinessBottomNav: () => <nav aria-label="업체 관리자 메뉴" />,
}));

import BusinessReviewsPage from "./page";

function party(
  id: string,
  options: {
    status?: "COMPLETED" | "CANCELLED";
    canBusinessReview?: boolean;
  } = {},
) {
  return {
    id,
    title: `리뷰 파티 ${id}`,
    operationalStatus: options.status ?? "COMPLETED",
    canBusinessReview: options.canBusinessReview ?? true,
  };
}

function page(items: ReturnType<typeof party>[], nextCursor: string | null) {
  return { items, nextCursor };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BusinessReviewsPage />
    </QueryClientProvider>,
  );
}

describe("BusinessReviewsPage", () => {
  beforeEach(() => {
    mocks.listOperatorPartyPage.mockReset();
  });

  afterEach(cleanup);

  it("uses the CLOSED cursor contract, excludes cancelled and ineligible rows, and windows the initial DOM", async () => {
    mocks.listOperatorPartyPage.mockResolvedValue(
      page(
        [
          ...Array.from({ length: 45 }, (_, index) => party(String(index + 1))),
          party("cancelled", { status: "CANCELLED", canBusinessReview: true }),
          party("ineligible", { canBusinessReview: false }),
        ],
        "closed-page-2",
      ),
    );
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("list", { name: "리뷰 가능 파티" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(40);
    expect(screen.getByText(/40 \/ 45개 표시 중/u)).toBeInTheDocument();
    expect(screen.queryByText("리뷰 파티 cancelled")).not.toBeInTheDocument();
    expect(screen.queryByText("리뷰 파티 ineligible")).not.toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledWith("biz-a", {
      lifecycle: "CLOSED",
      limit: 50,
      cursor: undefined,
    });

    await user.click(screen.getByRole("button", { name: "리뷰 파티 더 보기" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(45);
    expect(screen.getByRole("link", { name: /리뷰 파티 41/u })).toHaveFocus();
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(1);
  });

  it("walks opaque CLOSED cursors with a bounded current-page DOM and cached back navigation", async () => {
    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      mocks.listOperatorPartyPage.mockResolvedValueOnce(
        page(
          Array.from({ length: 50 }, (_, itemIndex) =>
            party(String(pageIndex * 50 + itemIndex + 1)),
          ),
          pageIndex === 4 ? null : `opaque-closed-${pageIndex + 2}`,
        ),
      );
    }
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("list", { name: "리뷰 가능 파티" });
    await user.click(screen.getByRole("button", { name: "리뷰 파티 더 보기" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(1);

    for (let expectedCallCount = 2; expectedCallCount <= 5; expectedCallCount += 1) {
      const firstIdOnPage = (expectedCallCount - 1) * 50 + 1;
      await user.click(screen.getByRole("button", { name: "다음 리뷰 페이지" }));
      await waitFor(() => {
        expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(expectedCallCount);
      });
      const firstLink = await screen.findByRole("link", {
        name: new RegExp(`리뷰 파티 ${firstIdOnPage}`),
      });
      await waitFor(() => expect(firstLink).toHaveFocus());
      expect(within(list).getAllByRole("listitem")).toHaveLength(40);
      expect(
        screen.queryByText(`리뷰 파티 ${firstIdOnPage - 1}`),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "리뷰 파티 더 보기" }));
      expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    }

    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByText("5페이지")).toBeInTheDocument();
    expect(screen.getByText(/50 \/ 50개 표시 중/u)).toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenNthCalledWith(5, "biz-a", {
      lifecycle: "CLOSED",
      limit: 50,
      cursor: "opaque-closed-5",
    });

    await user.click(screen.getByRole("button", { name: "이전 리뷰 페이지" }));
    expect(await screen.findByText("리뷰 파티 151")).toBeInTheDocument();
    expect(screen.queryByText("리뷰 파티 201")).not.toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenCalledTimes(5);
  });

  it("retains loaded reviews and offers an explicit retry when the next cursor fails", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(page([party("1"), party("2")], "closed-page-2"))
      .mockRejectedValueOnce(new Error("next page unavailable"))
      .mockResolvedValueOnce(page([party("3")], null));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("리뷰 파티 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다음 리뷰 페이지" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("이미 불러온 리뷰 가능 파티는 그대로 유지했습니다");
    expect(screen.getByText("리뷰 파티 1")).toBeInTheDocument();
    expect(screen.getByText("리뷰 파티 2")).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: "다음 페이지 다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
    await user.click(retry);
    const appendedReview = await screen.findByRole("link", {
      name: /리뷰 파티 3/u,
    });
    await waitFor(() => expect(appendedReview).toHaveFocus());
    expect(screen.queryByText("리뷰 파티 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.listOperatorPartyPage).toHaveBeenNthCalledWith(3, "biz-a", {
      lifecycle: "CLOSED",
      limit: 50,
      cursor: "closed-page-2",
    });
  });

  it("focuses the empty state when later terminal pages contain no reviewable party", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(
        page(
          [party("cancelled-1", { status: "CANCELLED", canBusinessReview: false })],
          "closed-page-2",
        ),
      )
      .mockResolvedValueOnce(
        page(
          [party("cancelled-2", { status: "CANCELLED", canBusinessReview: false })],
          null,
        ),
      );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "다음 종료 파티 확인" }),
    );

    const emptyState = await screen.findByText(
      "아직 리뷰할 수 있는 종료 파티가 없어요.",
    );
    const focusTarget = emptyState.closest("[tabindex='-1']");
    expect(focusTarget).not.toBeNull();
    await waitFor(() => expect(focusTarget).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("does not claim the list is empty while later CLOSED pages remain", async () => {
    mocks.listOperatorPartyPage
      .mockResolvedValueOnce(
        page(
          [party("cancelled", { status: "CANCELLED", canBusinessReview: false })],
          "closed-page-2",
        ),
      )
      .mockResolvedValueOnce(page([party("completed")], null));
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("현재 불러온 종료 파티에는 리뷰 가능한 파티가 없어요."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("아직 리뷰할 수 있는 종료 파티가 없어요."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다음 종료 파티 확인" }));
    expect(await screen.findByText("리뷰 파티 completed")).toBeInTheDocument();
  });
});
