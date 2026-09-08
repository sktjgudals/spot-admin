import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminUserDetail, AdminUserSummary } from "@/auth/api/admin-users.api";
import { UserDetailHeader } from "./UserDetailHeader";

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    profile: {
      id: "u1",
      nickname: "민정",
      email: "min@dopa.ing",
      profileImage: null,
      status: "ACTIVE",
      createdAt: "2026-01-02T00:00:00.000Z",
      lastSeenAt: "2026-09-07T10:00:00.000Z",
      deletedAt: null,
    },
    devices: { activeSessionCount: 1, sessions: [], pushTokens: [] },
    counts: {
      applications: { PENDING: 1, APPROVED: 3, REJECTED: 0, CANCELED: 2, total: 6 },
      payments: { count: 4, paidCount: 3, paidAmount: 90000, businessCount: 2 },
      refunds: { count: 0, completedAmount: 0 },
      reportsFiled: 0,
      reportsReceived: { total: 0, pending: 0 },
      activeRestrictions: [],
    },
    consent: null,
    asOf: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function user(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: "u1",
    email: "min@dopa.ing",
    nickname: "민정",
    profileImage: null,
    provider: "google",
    role: "USER",
    status: "ACTIVE",
    averageRating: 4.5,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    assignedBusinessId: null,
    blocked: false,
    asOf: "2026-09-08T00:00:00.000Z",
    summary: summary(),
    ...overrides,
  };
}

describe("UserDetailHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the application count as a total plus its non-zero breakdown, never the raw total key", () => {
    render(
      <UserDetailHeader
        user={user()}
        summary={summary()}
        summaryPending={false}
        withdrawn={false}
        actions={null}
      />,
    );

    const fact = screen.getByText(/신청 6건/);
    expect(fact).toHaveTextContent("신청 6건");
    expect(fact).toHaveTextContent("승인 3");
    expect(fact).toHaveTextContent("취소 2");
    expect(fact.textContent).not.toMatch(/\btotal\b/);
    expect(fact.textContent).not.toMatch(/거절 0/);
  });

  it("omits the role badge instead of fabricating one for a summary-only profile", () => {
    render(
      <UserDetailHeader
        user={user({ role: "", blocked: null })}
        summary={summary()}
        summaryPending={false}
        withdrawn={true}
        actions={null}
      />,
    );

    expect(screen.queryByText("USER")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인 제한")).not.toBeInTheDocument();
    expect(screen.getByText("탈퇴")).toBeInTheDocument();
  });

  it("shows the login-restricted badge only when blocked is exactly true", () => {
    render(
      <UserDetailHeader
        user={user({ blocked: true })}
        summary={summary()}
        summaryPending={false}
        withdrawn={false}
        actions={null}
      />,
    );

    expect(screen.getByText("로그인 제한")).toBeInTheDocument();
  });
});
