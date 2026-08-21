import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function renderConsole(config: ResourceConfig) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminResourceConsole config={config} />
    </QueryClientProvider>,
  );
}

describe("AdminResourceConsole", () => {
  beforeEach(() => {
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
    expect(listAdminResources).toHaveBeenLastCalledWith("payments", {
      q: "",
      limit: 50,
      cursor: "cursor-2",
    });
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
    await screen.findByText(/order-1/);
    await user.click(screen.getByRole("button", { name: /수동 환불/ }));

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
