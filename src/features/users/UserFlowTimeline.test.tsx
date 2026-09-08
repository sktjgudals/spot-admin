import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-users.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-users.api")>();
  return { ...actual, getAdminUserTimeline: vi.fn() };
});

import {
  getAdminUserTimeline,
  type UserTimelineItem,
  type UserTimelinePage,
} from "@/auth/api/admin-users.api";
import { UserFlowTimeline } from "./UserFlowTimeline";

function item(overrides: Partial<UserTimelineItem>): UserTimelineItem {
  return {
    id: "e1",
    at: "2026-09-08T02:00:00.000Z",
    kind: "PAYMENT_APPROVED",
    category: "PAYMENT",
    title: "결제 완료",
    detail: null,
    refs: {},
    status: null,
    amount: null,
    meta: {},
    // A real wire value ("identity" | "domain" | "notification" | "admin"),
    // not the old db/audit/projection vocabulary.
    source: "domain",
    ...overrides,
  };
}

function page(
  items: UserTimelineItem[],
  nextCursor: string | null,
  coverage: UserTimelinePage["coverage"] = [],
): UserTimelinePage {
  return {
    user: { id: "u1", nickname: "민정", status: "ACTIVE", deletedAt: null },
    items,
    nextCursor,
    asOf: "2026-09-08T06:00:00.000Z",
    coverage,
  };
}

function renderTimeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserFlowTimeline userId="u1" />
    </QueryClientProvider>,
  );
}

describe("UserFlowTimeline", () => {
  beforeEach(() => {
    vi.mocked(getAdminUserTimeline).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("appends the next cursor page and hands keyboard focus to the first new row", async () => {
    vi.mocked(getAdminUserTimeline).mockImplementation(async (_userId, params = {}) => {
      if (params.cursor === "cursor-2") {
        return page(
          [item({ id: "e2", title: "환불 완료", kind: "REFUND_DECIDED" })],
          null,
        );
      }
      return page([item({ id: "e1" })], "cursor-2");
    });
    const user = userEvent.setup();
    renderTimeline();

    expect(await screen.findByText("결제 완료")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    const appended = await screen.findByText("환불 완료");
    await waitFor(() => expect(appended.closest("li")).toHaveFocus());
    expect(screen.getByText("결제 완료")).toBeInTheDocument();
    // The default period is 28일, so `from` rides along with the cursor.
    expect(getAdminUserTimeline).toHaveBeenLastCalledWith("u1", {
      from: expect.any(String),
      cursor: "cursor-2",
    });
  });

  it("keeps the loaded rows and offers an inline retry when the next page fails", async () => {
    vi.mocked(getAdminUserTimeline).mockImplementation(async (_userId, params = {}) => {
      if (params.cursor === "cursor-2") throw new Error("next page unavailable");
      return page([item({ id: "e1" })], "cursor-2");
    });
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("결제 완료");
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("이미 불러온 활동은 그대로 유지했습니다");
    expect(screen.getByText("결제 완료")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "다음 페이지 다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
  });

  it("re-queries with the category's kinds when a chip is pressed", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(page([item({ id: "e1" })], null));
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("결제 완료");
    const chip = screen.getByRole("button", { name: "결제" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(getAdminUserTimeline).toHaveBeenLastCalledWith("u1", {
        from: expect.any(String),
        kinds: expect.arrayContaining(["PAYMENT_APPROVED", "REFUND_DECIDED"]),
      }),
    );
  });

  it("tells an empty account apart from a filter that matched nothing", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(page([], null));
    renderTimeline();

    expect(await screen.findByText("표시할 활동이 없습니다")).toBeInTheDocument();
    cleanup();

    vi.mocked(getAdminUserTimeline).mockResolvedValue(
      page(
        [
          item({
            id: "e1",
            category: "SOCIAL",
            kind: "USER_FOLLOWED",
            title: "팔로우",
          }),
        ],
        null,
      ),
    );
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("팔로우");
    await user.click(screen.getByRole("button", { name: "결제" }));

    expect(await screen.findByText("조건에 맞는 활동이 없습니다")).toBeInTheDocument();
  });

  it("shows what the window covers and every retention warning the server sent", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(
      page([item({ id: "e1" })], null, [
        {
          category: "SESSION",
          source: "identity",
          retainedFrom: "2026-06-10T00:00:00.000Z",
          note: "접속 기록은 90일만 보관합니다.",
        },
      ]),
    );
    renderTimeline();

    expect(await screen.findByText(/기간의/)).toHaveTextContent("를 포함합니다");
    expect(screen.getByText("접속 기록은 90일만 보관합니다.")).toBeInTheDocument();
  });

  it("links the references that resolve and shows the rest as plain labels", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(
      page(
        [
          item({
            id: "e1",
            detail: "카드 결제 승인",
            refs: { paymentId: "pay-1", reportId: "rep-1" },
          }),
        ],
        null,
      ),
    );
    renderTimeline();

    const row = (await screen.findByText("결제 완료")).closest("li");
    expect(row).not.toBeNull();
    const scope = within(row as HTMLElement);
    expect(scope.getByRole("link", { name: "결제 · pay-1" })).toHaveAttribute(
      "href",
      "/super-admin/payments?payments_q=pay-1",
    );
    expect(scope.queryByRole("link", { name: "신고 · rep-1" })).toBeNull();
    expect(scope.getByText("신고 · rep-1")).toBeInTheDocument();
    expect(scope.getByText("카드 결제 승인")).toBeInTheDocument();
    expect(scope.getByText("DB")).toBeInTheDocument();
  });

  it("drops the window bound when the period is set to 전체", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(page([item({ id: "e1" })], null));
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("결제 완료");
    await user.selectOptions(screen.getByLabelText("기간"), "all");

    await waitFor(() => expect(getAdminUserTimeline).toHaveBeenLastCalledWith("u1", {}));
  });
});
