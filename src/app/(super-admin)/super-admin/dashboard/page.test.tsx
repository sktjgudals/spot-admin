import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-dashboard.api", () => ({
  fetchAdminDashboardSummary: vi.fn(),
}));

import { fetchAdminDashboardSummary } from "@/auth/api/admin-dashboard.api";
import SuperAdminDashboard from "./page";

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SuperAdminDashboard />
    </QueryClientProvider>,
  );
}

describe("SuperAdminDashboard", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminDashboardSummary).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("prioritizes real pending work and links to the filtered queue", async () => {
    vi.mocked(fetchAdminDashboardSummary).mockResolvedValue({
      asOf: "2026-08-31T01:00:00.000Z",
      users: { total: 12_345, blocked: 8 },
      businesses: { total: 321, pending: 4 },
      parties: { total: 987 },
    });
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "운영 대시보드" })).toBeInTheDocument();
    expect(await screen.findByText("4개")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /승인 대기 업체 확인/ })).toHaveAttribute(
      "href",
      "/app/businesses?status=PENDING",
    );
    expect(screen.getByText("12,345")).toBeInTheDocument();
    const reportsLink = screen.getByRole("link", { name: /신고 처리/ });
    expect(reportsLink).toHaveAttribute("href", "/super-admin/reports");
    expect(reportsLink).not.toHaveAttribute("aria-label");
  });

  it("describes active login restrictions without linking to a different account status", async () => {
    vi.mocked(fetchAdminDashboardSummary).mockResolvedValue({
      asOf: "2026-08-31T01:00:00.000Z",
      users: { total: 12_345, blocked: 8 },
      businesses: { total: 321, pending: 4 },
      parties: { total: 987 },
    });
    renderDashboard();

    expect(await screen.findAllByText("활성 로그인 제한")).not.toHaveLength(0);
    expect(
      screen.getByText("LOGIN_BLOCK·FULL_SUSPEND가 현재 적용된 고유 사용자입니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /활성 로그인 제한|정지 계정 확인/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps recovery explicit when the summary request fails", async () => {
    vi.mocked(fetchAdminDashboardSummary).mockRejectedValue(new Error("network unavailable"));
    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent("통계를 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeEnabled();
  });
});
