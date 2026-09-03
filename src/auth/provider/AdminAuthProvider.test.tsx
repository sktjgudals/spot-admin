import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAccessTokenForTests,
  clearAccessToken,
} from "@/auth/store/admin-auth.store";

const mocks = vi.hoisted(() => ({
  refreshAdminSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/auth/api/admin-auth.api", () => ({
  fetchAdminMe: vi.fn(),
  loginWithOidc: vi.fn(),
  loginWithPassword: vi.fn(),
  logoutSession: vi.fn(),
}));

vi.mock("@/auth/refresh/refresh-single-flight", () => ({
  refreshAdminSession: mocks.refreshAdminSession,
  assertRefreshFailedUnauthorized: () => false,
}));

import { AuthGuard } from "@/auth/guards/AuthGuard";
import { AdminAuthProvider, useAdminAuthContext } from "./AdminAuthProvider";

function SessionControl() {
  const { status } = useAdminAuthContext();
  return (
    <>
      <output aria-label="인증 상태">{status}</output>
      <button type="button" onClick={clearAccessToken}>
        세션 만료 시뮬레이션
      </button>
    </>
  );
}

describe("AdminAuthProvider session expiry", () => {
  beforeEach(() => {
    __resetAccessTokenForTests();
    mocks.replace.mockReset();
    mocks.refreshAdminSession.mockReset();
    mocks.refreshAdminSession.mockResolvedValue({
      accessToken: "access-token",
      sessionId: "session-id",
      admin: {
        id: "admin-1",
        email: "admin@example.test",
        name: "관리자",
        role: "SUPER_ADMIN",
        businessId: null,
        status: "ACTIVE",
      },
    });
  });

  afterEach(() => {
    cleanup();
    __resetAccessTokenForTests();
  });

  it("clears cached admin data and redirects when the token store signals expiry", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["admin-sensitive"], {
      email: "member@example.test",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AdminAuthProvider>
          <SessionControl />
          <AuthGuard>
            <p>민감한 관리자 화면</p>
          </AuthGuard>
        </AdminAuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("민감한 관리자 화면")).toBeInTheDocument();
    expect(queryClient.getQueryData(["admin-sensitive"])).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "세션 만료 시뮬레이션" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("인증 상태")).toHaveTextContent(
        "unauthenticated",
      );
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(mocks.replace).toHaveBeenCalledWith("/login?signedOut=1");
    expect(screen.queryByText("민감한 관리자 화면")).not.toBeInTheDocument();
  });
});
