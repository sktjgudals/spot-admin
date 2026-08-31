import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listReports: vi.fn(),
}));

vi.mock("@/auth/api/admin-reports.api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/auth/api/admin-reports.api")>();

  return {
    ...actual,
    listAdminReports: mocks.listReports,
  };
});

import SuperAdminReportsPage from "./page";

function report(reportId: string, targetNickname: string) {
  return {
    reportId,
    reporterUserId: `reporter-${reportId}`,
    reporterNickname: `신고자 ${reportId}`,
    targetKind: "USER",
    targetId: `target-${reportId}`,
    targetNickname,
    conversationId: null,
    businessId: null,
    reasonCode: "HARASSMENT",
    status: "PENDING" as const,
    createdAt: "2026-08-31T00:00:00.000Z",
    dueAt: "2026-09-01T00:00:00.000Z",
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    resolutionNote: null,
    overdue: false,
  };
}

function page(items: ReturnType<typeof report>[], nextCursor: string | null) {
  return {
    items,
    nextCursor,
    openCount: 2,
    overdueCount: 0,
    slaHours: 24,
    asOf: "2026-08-31T00:00:00.000Z",
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <SuperAdminReportsPage />
    </QueryClientProvider>,
  );
}

describe("SuperAdminReportsPage", () => {
  beforeEach(() => {
    mocks.listReports.mockReset();
  });

  afterEach(cleanup);

  it("keeps loaded reports visible when the next page fails and retries inline", async () => {
    const user = userEvent.setup();
    let listPageRequest = 0;
    mocks.listReports.mockImplementation(
      (params: { status?: string; cursor?: string; limit?: number }) => {
        if (params.limit === 1) return Promise.resolve(page([], null));
        listPageRequest += 1;
        if (listPageRequest === 1) {
          return Promise.resolve(
            page([report("report-1", "첫 번째 대상")], "cursor-2"),
          );
        }
        if (listPageRequest === 2) {
          return Promise.reject(new Error("next page unavailable"));
        }
        return Promise.resolve(
          page([report("report-2", "두 번째 대상")], null),
        );
      },
    );

    renderPage();

    expect(await screen.findByText("첫 번째 대상")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /더 보기/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "다음 신고를 불러오지 못했습니다.",
    );
    expect(screen.getByText("첫 번째 대상")).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: "다음 페이지 다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
    await user.click(retry);

    const appendedReport = await screen.findByText("두 번째 대상");
    await waitFor(() => expect(appendedReport.closest("tr")).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.listReports).toHaveBeenCalledWith({
      status: "PENDING",
      limit: 1,
    });
    expect(mocks.listReports).toHaveBeenCalledWith({
      status: "PENDING",
      cursor: "cursor-2",
    });
    expect(
      mocks.listReports.mock.calls.filter(
        ([params]) => params.cursor === "cursor-2",
      ),
    ).toHaveLength(2);
  });

  it("focuses the empty report state when an empty cursor chain terminates", async () => {
    const user = userEvent.setup();
    let listPageRequest = 0;
    mocks.listReports.mockImplementation(
      (params: { status?: string; cursor?: string; limit?: number }) => {
        if (params.limit === 1) return Promise.resolve(page([], null));
        listPageRequest += 1;
        return Promise.resolve(
          page([], listPageRequest === 1 ? "cursor-2" : null),
        );
      },
    );
    renderPage();

    await user.click(await screen.findByRole("button", { name: /더 보기/u }));

    const emptyState = await screen.findByText("표시할 신고가 없습니다.");
    const focusTarget = emptyState.closest("[tabindex='-1']");
    expect(focusTarget).not.toBeNull();
    await waitFor(() => expect(focusTarget).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });
});
