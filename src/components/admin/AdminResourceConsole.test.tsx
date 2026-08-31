import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/super-admin/payments",
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

vi.mock("@/auth/api/admin-resources.api", () => ({
  listAdminResources: vi.fn(),
  mutateAdminResource: vi.fn(),
}));

import {
  listAdminResources,
  mutateAdminResource,
} from "@/auth/api/admin-resources.api";
import {
  AdminResourceConsole,
  resourceConfigs,
  type ResourceConfig,
} from "@/components/admin/AdminResourceConsole";

const page = {
  items: [
    {
      id: "pay-1",
      orderId: "order-1",
      partyTitle: "금요일 라운지",
      amount: 20_000,
      refundedAmount: 0,
      status: "DONE",
    },
  ],
  nextCursor: "cursor-2",
  asOf: "2026-08-21T00:00:00.000Z",
};

function renderConsole(config: ResourceConfig, queryParamNamespace?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminResourceConsole
        config={config}
        queryParamNamespace={queryParamNamespace}
      />
    </QueryClientProvider>,
  );
}

describe("AdminResourceConsole", () => {
  beforeEach(() => {
    navigation.pathname = "/super-admin/payments";
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    vi.mocked(listAdminResources).mockReset();
    vi.mocked(mutateAdminResource).mockReset();
    vi.spyOn(window, "prompt").mockImplementation(() => {
      throw new Error("window.prompt must not be used");
    });
    vi.spyOn(window, "confirm").mockImplementation(() => {
      throw new Error("window.confirm must not be used");
    });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("does not treat a partial first page as the full list", async () => {
    vi.mocked(listAdminResources).mockResolvedValue(page);
    renderConsole(resourceConfigs.payments);

    expect(await screen.findByText(/1건\+/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "더 보기" })).toBeEnabled();
    expect(listAdminResources).toHaveBeenCalledWith("payments", {
      q: "",
      limit: 50,
    });
  });

  it("loads the next cursor instead of dropping later rows", async () => {
    vi.mocked(listAdminResources).mockImplementation(async (_resource, params = {}) => {
      if (params.cursor === "cursor-2") {
        return {
          items: [
            {
              id: "pay-2",
              orderId: "order-2",
              partyTitle: "토요일 라운지",
              amount: 10_000,
              refundedAmount: 0,
              status: "DONE",
            },
          ],
          nextCursor: null,
          asOf: "2026-08-21T00:00:00.000Z",
        };
      }
      return page;
    });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    await user.click(await screen.findByRole("button", { name: "더 보기" }));

    expect(await screen.findByText(/2건 ·/)).toBeInTheDocument();
    const appendedResource = screen.getAllByText(/order-2/)[0];
    await waitFor(() =>
      expect(appendedResource.closest("article, tr")).toHaveFocus(),
    );
    expect(screen.queryAllByText(/order-1/)).toHaveLength(0);
    expect(listAdminResources).toHaveBeenLastCalledWith("payments", {
      q: "",
      limit: 50,
      cursor: "cursor-2",
    });
  });

  it("keeps the current page visible and offers an inline retry when the next cursor fails", async () => {
    vi.mocked(listAdminResources).mockImplementation(async (_resource, params = {}) => {
      if (params.cursor === "cursor-2") throw new Error("next page unavailable");
      return page;
    });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    expect((await screen.findAllByText(/order-1/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("현재 목록은 유지됩니다");
    expect(screen.getAllByText(/order-1/).length).toBeGreaterThan(0);
    const retry = screen.getByRole("button", { name: "다음 목록 다시 시도" });
    expect(retry).toBeEnabled();
    await waitFor(() => expect(retry).toHaveFocus());
  });

  it("moves focus to the empty current-page state when a terminal cursor page has no items", async () => {
    vi.mocked(listAdminResources).mockImplementation(async (_resource, params = {}) => {
      if (params.cursor === "cursor-2") {
        return {
          items: [],
          nextCursor: null,
          asOf: "2026-08-21T00:00:01.000Z",
        };
      }
      return page;
    });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    await user.click(await screen.findByRole("button", { name: "더 보기" }));

    const emptyState = await screen.findByText("표시할 데이터가 없습니다.");
    const focusTarget = emptyState.closest("[tabindex='-1']");
    expect(focusTarget).not.toBeNull();
    await waitFor(() => expect(focusTarget).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("collects refund amount and reason in a summary dialog", async () => {
    vi.mocked(listAdminResources).mockImplementation(async () => ({
      ...page,
      nextCursor: null,
    }));
    vi.mocked(mutateAdminResource).mockResolvedValue({ id: "pay-1" });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    await screen.findByText("결제 관리");
    expect((await screen.findAllByText(/order-1/)).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /수동 환불/ })[0]);

    expect(await screen.findByRole("heading", { name: "수동 환불" })).toBeInTheDocument();
    expect(screen.getByText(/주문번호 order-1/)).toBeInTheDocument();
    expect(screen.getByLabelText("환불 금액(원)")).toHaveValue(20000);
    await user.clear(screen.getByLabelText("환불 사유"));
    await user.type(screen.getByLabelText("환불 사유"), "중복 결제");
    await user.click(screen.getByRole("button", { name: "환불 실행" }));

    expect(mutateAdminResource).toHaveBeenCalledWith(
      "/admin/v2/payments/pay-1/manual-refund",
      "POST",
      { amount: 20_000, reason: "중복 결제" },
    );
  });

  it("hydrates search from the URL and keeps submitted search in the URL", async () => {
    navigation.params = new URLSearchParams("q=order-1");
    vi.mocked(listAdminResources).mockResolvedValue({ ...page, nextCursor: null });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    expect(await screen.findByLabelText("결제 관리 검색어")).toHaveValue("order-1");
    expect(listAdminResources).toHaveBeenCalledWith("payments", {
      q: "order-1",
      limit: 50,
    });

    await user.clear(screen.getByLabelText("결제 관리 검색어"));
    await user.type(screen.getByLabelText("결제 관리 검색어"), "order-2");
    await user.click(screen.getByRole("button", { name: "검색" }));

    expect(navigation.replace).toHaveBeenCalledWith(
      "/super-admin/payments?q=order-2",
      { scroll: false },
    );
    expect(listAdminResources).toHaveBeenLastCalledWith("payments", {
      q: "order-2",
      limit: 50,
    });
  });

  it("applies a configured status filter through the URL and API", async () => {
    navigation.pathname = "/super-admin/users";
    navigation.params = new URLSearchParams("status=SUSPENDED");
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [{ id: "user-1", nickname: "민정", status: "SUSPENDED" }],
      nextCursor: null,
      asOf: page.asOf,
    });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.users);

    const statusFilter = await screen.findByLabelText("사용자 관리 상태 필터");
    expect(statusFilter).toHaveValue("SUSPENDED");
    expect(listAdminResources).toHaveBeenCalledWith("users", {
      q: "",
      status: "SUSPENDED",
      limit: 50,
    });

    await user.selectOptions(statusFilter, "ACTIVE");

    expect(navigation.replace).toHaveBeenCalledWith(
      "/super-admin/users?status=ACTIVE",
      { scroll: false },
    );
    expect(listAdminResources).toHaveBeenLastCalledWith("users", {
      q: "",
      status: "ACTIVE",
      limit: 50,
    });
  });

  it("isolates URL filters when two resource consoles share one route", async () => {
    navigation.params = new URLSearchParams(
      "payments_q=order-1&refunds_q=refund-1&view=compact",
    );
    vi.mocked(listAdminResources).mockImplementation(async (resource) => ({
      items: resource === "payments" ? page.items : [],
      nextCursor: null,
      asOf: page.asOf,
    }));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <AdminResourceConsole
          config={resourceConfigs.payments}
          queryParamNamespace="payments"
        />
        <AdminResourceConsole
          config={resourceConfigs.refunds}
          queryParamNamespace="refunds"
        />
      </QueryClientProvider>,
    );

    const payments = (await screen.findByRole("heading", {
      name: "결제 관리",
    })).closest("section");
    const refunds = screen.getByRole("heading", {
      name: "환불 재처리",
    }).closest("section");
    expect(payments).not.toBeNull();
    expect(refunds).not.toBeNull();
    expect(within(payments!).getByLabelText("결제 관리 검색어")).toHaveValue(
      "order-1",
    );
    expect(within(refunds!).getByLabelText("환불 재처리 검색어")).toHaveValue(
      "refund-1",
    );
    expect(listAdminResources).toHaveBeenCalledWith("payments", {
      q: "order-1",
      limit: 50,
    });
    expect(listAdminResources).toHaveBeenCalledWith("refunds", {
      q: "refund-1",
      limit: 50,
    });

    const paymentSearch = within(payments!).getByLabelText("결제 관리 검색어");
    await user.clear(paymentSearch);
    await user.type(paymentSearch, "order-2");
    await user.click(within(payments!).getByRole("button", { name: "검색" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/super-admin/payments?payments_q=order-2&refunds_q=refund-1&view=compact",
      { scroll: false },
    );
    expect(listAdminResources).toHaveBeenLastCalledWith("payments", {
      q: "order-2",
      limit: 50,
    });
    expect(listAdminResources).not.toHaveBeenCalledWith(
      "refunds",
      expect.objectContaining({ q: "order-2" }),
    );
  });

  it("preserves an unsubmitted draft when another console changes its URL namespace", async () => {
    navigation.params = new URLSearchParams(
      "payments_q=order-1&refunds_q=refund-1&view=compact",
    );
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [],
      nextCursor: null,
      asOf: page.asOf,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const consoles = () => (
      <QueryClientProvider client={client}>
        <AdminResourceConsole
          config={resourceConfigs.payments}
          queryParamNamespace="payments"
        />
        <AdminResourceConsole
          config={resourceConfigs.refunds}
          queryParamNamespace="refunds"
        />
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    const rendered = render(consoles());

    const paymentSearch = await screen.findByLabelText("결제 관리 검색어");
    await user.clear(paymentSearch);
    await user.type(paymentSearch, "draft-order");

    navigation.params = new URLSearchParams(
      "payments_q=order-1&refunds_q=refund-2&view=compact",
    );
    rendered.rerender(consoles());

    expect(paymentSearch).toHaveValue("draft-order");
    expect(screen.getByLabelText("환불 재처리 검색어")).toHaveValue(
      "refund-2",
    );
  });

  it("shows typed values in the list and untruncated configured fields in details", async () => {
    vi.mocked(listAdminResources).mockResolvedValue({ ...page, nextCursor: null });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    expect((await screen.findAllByText("₩20,000")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("완료").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "상세" })[0]);

    expect(await screen.findByRole("heading", { name: "결제 관리 상세" })).toBeInTheDocument();
    expect(screen.getByText("pay-1")).toBeInTheDocument();
    expect(screen.getAllByText("금요일 라운지").length).toBeGreaterThan(0);
  });

  it("distinguishes a filtered empty result and can clear its URL filters", async () => {
    navigation.params = new URLSearchParams("q=missing");
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [],
      nextCursor: null,
      asOf: page.asOf,
    });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.payments);

    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /필터 초기화/ })[0]);

    expect(navigation.replace).toHaveBeenCalledWith("/super-admin/payments", {
      scroll: false,
    });
  });
});

describe("resource action contracts", () => {
  it("collects a reject reason without window.prompt", () => {
    const action = resourceConfigs["business-role-requests"].actions?.find(
      (item) => item.label === "거절",
    );
    expect(action?.confirm?.reason?.required).toBe(true);
    expect(
      action?.body?.({ id: "request-1", status: "PENDING" }, { reason: "서류 부족" }),
    ).toEqual({ reason: "서류 부족" });
  });
});
