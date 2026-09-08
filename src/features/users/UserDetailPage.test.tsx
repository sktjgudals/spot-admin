import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

vi.mock("@/auth/api/admin-users.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-users.api")>();
  return {
    ...actual,
    getAdminUser: vi.fn(),
    getAdminUserSummary: vi.fn(),
    getAdminUserTimeline: vi.fn(),
  };
});

vi.mock("@/auth/api/admin-resources.api", () => ({
  mutateAdminResource: vi.fn(),
}));

vi.mock("@/features/analytics/UserBehaviorPanel", () => ({
  UserBehaviorPanel: ({ userId, nickname }: { userId: string; nickname: string }) => (
    <div data-testid="behavior-panel">{`${nickname}:${userId}`}</div>
  ),
}));

import {
  getAdminUser,
  getAdminUserSummary,
  getAdminUserTimeline,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/auth/api/admin-users.api";
import { mutateAdminResource } from "@/auth/api/admin-resources.api";
import { UserDetailPage } from "./UserDetailPage";

const analytics = {
  properties: [{ id: "5678", label: "Dopa App", platform: "mixed" as const }],
  googleClientId: "public-client-id",
  configError: null,
};

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
    devices: {
      activeSessionCount: 2,
      sessions: [
        {
          id: "s1",
          subjectType: "USER",
          platform: "ios",
          deviceName: "iPhone",
          appVersion: "1.0.5",
          ip: null,
          userAgent: null,
          createdAt: null,
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
      ],
      pushTokens: [],
    },
    counts: {
      applications: { PENDING: 0, APPROVED: 3, REJECTED: 0, CANCELED: 0, total: 3 },
      payments: { count: 4, paidCount: 3, paidAmount: 90000, businessCount: 2 },
      refunds: { count: 1, completedAmount: 20000 },
      reportsFiled: 1,
      reportsReceived: { total: 2, pending: 1 },
      activeRestrictions: [],
    },
    consent: {
      termsVersion: "v3",
      agreedAt: "2026-01-02T00:00:00.000Z",
      marketingOptIn: true,
    },
    asOf: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const rendered = render(
    <QueryClientProvider client={client}>
      <UserDetailPage userId="u1" analytics={analytics} />
    </QueryClientProvider>,
  );
  return { ...rendered, invalidate };
}

describe("UserDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getAdminUser).mockReset();
    vi.mocked(getAdminUserSummary).mockReset();
    vi.mocked(mutateAdminResource).mockReset();
    vi.mocked(getAdminUserTimeline).mockReset();
    vi.mocked(getAdminUserTimeline).mockResolvedValue({
      user: { id: "u1", nickname: "민정", status: "ACTIVE", deletedAt: null },
      items: [],
      nextCursor: null,
      asOf: "2026-09-08T00:00:00.000Z",
      coverage: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the profile, the facts and the way back to the list", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail());
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "민정", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 사용자 목록" })).toHaveAttribute(
      "href",
      "/super-admin/users",
    );
    expect(screen.getByText("u1")).toBeInTheDocument();
    expect(screen.getByText("min@dopa.ing")).toBeInTheDocument();
    expect(screen.getByText("google")).toBeInTheDocument();
    expect(screen.getByText(/결제 3\/4건/)).toBeInTheDocument();
    expect(screen.getByText(/마케팅 동의/)).toBeInTheDocument();
    // The inline summary means the separate route is never called.
    expect(getAdminUserSummary).not.toHaveBeenCalled();
    // The mobile chip nav's "#flow"/"#behavior" anchors need a focusable
    // target so following one actually moves focus, not just the scroll.
    expect(document.getElementById("flow")).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById("behavior")).toHaveAttribute("tabindex", "-1");
  });

  it("hands the lazy GA panel this user's id", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail());
    renderPage();

    expect(await screen.findByTestId("behavior-panel")).toHaveTextContent("민정:u1");
  });

  it("renders a withdrawn account from the summary when the row is gone", async () => {
    vi.mocked(getAdminUser).mockRejectedValue(
      new AdminAuthError("NOT_FOUND", "gone", { status: 404 }),
    );
    vi.mocked(getAdminUserSummary).mockResolvedValue(
      summary({
        profile: {
          ...summary().profile,
          deletedAt: "2026-09-05T00:00:00.000Z",
          status: "SUSPENDED",
        },
      }),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "민정", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("탈퇴")).toBeInTheDocument();
    expect(screen.queryByText("사용자를 찾을 수 없습니다")).not.toBeInTheDocument();
    // The summary-only reconstruction has no real `role` to show, and a
    // withdrawn account cannot be banned or unbanned.
    expect(screen.queryByText("USER")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정지" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정지 해제" })).not.toBeInTheDocument();
  });

  it("says the account does not exist when neither route has a row", async () => {
    vi.mocked(getAdminUser).mockRejectedValue(
      new AdminAuthError("NOT_FOUND", "gone", { status: 404 }),
    );
    vi.mocked(getAdminUserSummary).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("사용자를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 사용자 목록" })).toBeInTheDocument();
  });

  it("names a permission failure instead of showing an empty profile", async () => {
    vi.mocked(getAdminUser).mockRejectedValue(
      new AdminAuthError("FORBIDDEN", "nope", { status: 403 }),
    );
    vi.mocked(getAdminUserSummary).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("이 계정을 볼 권한이 없습니다.")).toBeInTheDocument();
  });

  it("keeps the profile readable when the summary projection is missing", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail({ summary: null }));
    vi.mocked(getAdminUserSummary).mockResolvedValue(null);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "민정", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("요약 정보 준비 중")).toBeInTheDocument();
  });

  it("bans through the shared confirm dialog and refreshes both caches", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail());
    vi.mocked(mutateAdminResource).mockResolvedValue({ id: "u1" });
    const user = userEvent.setup();
    const { invalidate } = renderPage();

    await screen.findByRole("heading", { name: "민정", level: 1 });
    await user.click(screen.getByRole("button", { name: "정지" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "정지" })).toBeInTheDocument();
    expect(within(dialog).getByText(/이름 민정/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "정지" }));

    await waitFor(() =>
      expect(mutateAdminResource).toHaveBeenCalledWith(
        "/admin/v2/users/u1/ban",
        "POST",
        undefined,
      ),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["admin", "users", "detail", "u1"],
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-v2", "users"] });
  });
});
