import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPage: vi.fn(),
  pathname: "/app/businesses",
  replace: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/api/admin-business.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-business.api")>();
  return { ...actual, listBusinessesPage: mocks.listPage };
});

import AppBusinessesPage from "./page";

function business(id: string, name: string) {
  return {
    id,
    name,
    kind: "COMPANY" as const,
    description: null,
    tagline: null,
    contactEmail: `${id}@dopa.ing`,
    contactPhone: null,
    address: null,
    businessNumber: null,
    status: "ACTIVE" as const,
    feeRateBps: 500,
    deletedAt: null,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = () => (
      <QueryClientProvider client={client}>
        <AppBusinessesPage />
      </QueryClientProvider>
    );
  const view = render(page());
  return { ...view, rerenderPage: () => view.rerender(page()) };
}

describe("AppBusinessesPage", () => {
  beforeEach(() => {
    mocks.pathname = "/app/businesses";
    mocks.replace.mockReset();
    mocks.search = "";
    mocks.listPage.mockReset();
    mocks.listPage
      .mockResolvedValueOnce({
        items: [business("biz-1", "도파 라운지")],
        nextCursor: "cursor-2",
        asOf: "2026-08-31T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        items: [business("biz-2", "도파 스튜디오")],
        nextCursor: null,
        asOf: "2026-08-31T00:00:00.000Z",
      });
  });

  afterEach(cleanup);

  it("renders one bounded cursor page and moves focus across next and previous navigation", async () => {
    mocks.search = "status=ACTIVE&q=%EB%8F%84%ED%8C%8C";
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("도파 라운지")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "업체 검색" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "업체 상태" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "업체 검색" })).toHaveValue("도파");
    expect(screen.getByRole("combobox", { name: "업체 상태" })).toHaveValue("ACTIVE");
    expect(screen.queryByText("Soft-deleted 포함")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다음 페이지" }));
    const nextBusiness = await screen.findByText("도파 스튜디오");
    await waitFor(() => expect(nextBusiness.closest("tr")).toHaveFocus());
    expect(screen.queryByText("도파 라운지")).not.toBeInTheDocument();
    expect(screen.getByText("2페이지 · 1건 표시")).toBeInTheDocument();
    expect(mocks.listPage).toHaveBeenNthCalledWith(2, {
      status: "ACTIVE",
      q: "도파",
      limit: 25,
      cursor: "cursor-2",
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "업체 검색" })).toHaveValue("도파");
    expect(screen.getByRole("combobox", { name: "업체 상태" })).toHaveValue("ACTIVE");

    await user.click(screen.getByRole("button", { name: "이전 페이지" }));
    const previousBusiness = await screen.findByText("도파 라운지");
    await waitFor(() => expect(previousBusiness.closest("tr")).toHaveFocus());
    expect(screen.queryByText("도파 스튜디오")).not.toBeInTheDocument();
    expect(screen.getByText("1페이지 · 1건 표시")).toBeInTheDocument();
    expect(mocks.listPage).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps retained rows and focuses the retry action before handing off to a recovered page", async () => {
    mocks.listPage.mockReset();
    mocks.listPage
      .mockResolvedValueOnce({
        items: [business("biz-1", "도파 라운지")],
        nextCursor: "cursor-2",
        asOf: "2026-08-31T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("next page unavailable"))
      .mockResolvedValueOnce({
        items: [business("biz-2", "도파 스튜디오")],
        nextCursor: null,
        asOf: "2026-08-31T00:00:01.000Z",
      });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("도파 라운지")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다음 페이지" }));

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByText("도파 라운지")).toBeInTheDocument();

    await user.click(retry);
    const recoveredBusiness = await screen.findByText("도파 스튜디오");
    await waitFor(() => expect(recoveredBusiness.closest("tr")).toHaveFocus());
    expect(screen.queryByText("도파 라운지")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 페이지" })).toBeDisabled();
  });

  it("focuses the empty-result fallback when the next cursor page has no rows", async () => {
    mocks.listPage.mockReset();
    mocks.listPage
      .mockResolvedValueOnce({
        items: [business("biz-1", "도파 라운지")],
        nextCursor: "cursor-2",
        asOf: "2026-08-31T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        asOf: "2026-08-31T00:00:01.000Z",
      });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("도파 라운지")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다음 페이지" }));

    const emptyRow = await screen.findByText(
      "이 페이지에 표시할 업체가 없습니다.",
    );
    await waitFor(() => expect(emptyRow.closest("tr")).toHaveFocus());
    expect(screen.queryByText("도파 라운지")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeEnabled();
  });

  it("initializes the server-side status filter from the dashboard URL", async () => {
    mocks.search = "status=PENDING";
    mocks.listPage.mockReset();
    mocks.listPage.mockResolvedValue({
      items: [business("biz-pending", "승인 대기 라운지")],
      nextCursor: null,
      asOf: "2026-08-31T00:00:00.000Z",
    });

    renderPage();

    expect(await screen.findByText("승인 대기 라운지")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "업체 상태" })).toHaveValue(
      "PENDING",
    );
    expect(mocks.listPage).toHaveBeenCalledWith({
      status: "PENDING",
      q: undefined,
      limit: 25,
      cursor: undefined,
    });
  });

  it("keeps committed search and status in the URL and restores external navigation", async () => {
    mocks.listPage.mockReset();
    mocks.listPage.mockResolvedValue({
      items: [business("biz-1", "도파 라운지")],
      nextCursor: null,
      asOf: "2026-08-31T00:00:00.000Z",
    });
    const user = userEvent.setup();
    const view = renderPage();

    const search = await screen.findByRole("searchbox", { name: "업체 검색" });
    await user.type(search, "도파 라운지");
    await user.click(screen.getByRole("button", { name: "검색" }));

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/app/businesses?q=%EB%8F%84%ED%8C%8C+%EB%9D%BC%EC%9A%B4%EC%A7%80",
      { scroll: false },
    );
    expect(mocks.listPage).toHaveBeenLastCalledWith({
      status: undefined,
      q: "도파 라운지",
      limit: 25,
      cursor: undefined,
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "업체 상태" }),
      "ACTIVE",
    );

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/app/businesses?q=%EB%8F%84%ED%8C%8C+%EB%9D%BC%EC%9A%B4%EC%A7%80&status=ACTIVE",
      { scroll: false },
    );
    expect(mocks.listPage).toHaveBeenLastCalledWith({
      status: "ACTIVE",
      q: "도파 라운지",
      limit: 25,
      cursor: undefined,
    });

    await user.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/app/businesses?status=ACTIVE",
      { scroll: false },
    );

    mocks.search = "status=PENDING&q=%EB%B3%B5%EC%9B%90";
    view.rerenderPage();

    await waitFor(() => {
      expect(screen.getByRole("searchbox", { name: "업체 검색" })).toHaveValue(
        "복원",
      );
      expect(screen.getByRole("combobox", { name: "업체 상태" })).toHaveValue(
        "PENDING",
      );
    });
    expect(mocks.listPage).toHaveBeenLastCalledWith({
      status: "PENDING",
      q: "복원",
      limit: 25,
      cursor: undefined,
    });
  });
});
