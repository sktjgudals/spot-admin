import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRefreshFlightForTests,
  isRefreshInFlight,
  refreshAccessToken,
} from "@/auth/refresh/refresh-single-flight";
import {
  __resetAccessTokenForTests,
  getAdminSessionGeneration,
  getAdminSessionPrincipal,
  getAccessToken,
  setAuthenticatedAdminSession,
  setAccessToken,
} from "@/auth/store/admin-auth.store";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

vi.mock("@/auth/api/admin-auth.api", () => ({
  refreshSession: vi.fn(),
}));

import { refreshSession } from "@/auth/api/admin-auth.api";

describe("refresh single-flight", () => {
  beforeEach(() => {
    __resetRefreshFlightForTests();
    __resetAccessTokenForTests();
    vi.mocked(refreshSession).mockReset();
  });

  it("shares one in-flight promise across concurrent callers", async () => {
    let resolve!: (v: {
      accessToken: string;
      sessionId: string;
      admin: {
        id: string;
        email: string;
        name: string;
        role: string;
        businessId: string | null;
        status: string;
      };
    }) => void;
    vi.mocked(refreshSession).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();
    expect(isRefreshInFlight()).toBe(true);
    expect(refreshSession).toHaveBeenCalledTimes(1);

    resolve({
      accessToken: "at-1",
      sessionId: "s",
      admin: {
        id: "a",
        email: "e",
        name: "n",
        role: "SUPER_ADMIN",
        businessId: null,
        status: "ACTIVE",
      },
    });

    await expect(p1).resolves.toBe("at-1");
    await expect(p2).resolves.toBe("at-1");
    expect(getAccessToken()).toBe("at-1");
    expect(isRefreshInFlight()).toBe(false);
  });

  it("allows a second refresh after the first completes", async () => {
    vi.mocked(refreshSession)
      .mockResolvedValueOnce({
        accessToken: "at-1",
        sessionId: "s",
        admin: {
          id: "a",
          email: "e",
          name: "n",
          role: "SUPER_ADMIN",
          businessId: null,
          status: "ACTIVE",
        },
      } as never)
      .mockResolvedValueOnce({
        accessToken: "at-2",
        sessionId: "s",
        admin: {
          id: "a",
          email: "e",
          name: "n",
          role: "SUPER_ADMIN",
          businessId: null,
          status: "ACTIVE",
        },
      } as never);

    await expect(refreshAccessToken()).resolves.toBe("at-1");
    await expect(refreshAccessToken()).resolves.toBe("at-2");
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it("clears the memory token when the refresh credential is rejected", async () => {
    setAccessToken("expired-access");
    vi.mocked(refreshSession).mockRejectedValue(
      new AdminAuthError("UNAUTHORIZED", "refresh expired", {
        status: 401,
        permanent: true,
      }),
    );

    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });

  it("preserves the current session on a retryable refresh network failure", async () => {
    setAccessToken("still-usable-access");
    vi.mocked(refreshSession).mockRejectedValue(
      new AdminAuthError("NETWORK_ERROR", "offline", { permanent: false }),
    );

    await expect(refreshAccessToken()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    expect(getAccessToken()).toBe("still-usable-access");
  });

  it("rejects and clears a refresh issued for a different administrator", async () => {
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    vi.mocked(refreshSession).mockResolvedValue({
      accessToken: "admin-b-token",
      sessionId: "session-b",
      admin: {
        id: "admin-b",
        email: "b@example.test",
        name: "Admin B",
        role: "BUSINESS_ADMIN",
        businessId: "business-b",
        status: "ACTIVE",
      },
    });

    await expect(refreshAccessToken()).rejects.toMatchObject({
      code: "SESSION_PRINCIPAL_CHANGED",
      status: 401,
      permanent: true,
    });
    expect(getAccessToken()).toBeNull();
    expect(getAdminSessionPrincipal()).toBeNull();
  });

  it("accepts a refreshed token for the same normalized principal", async () => {
    setAuthenticatedAdminSession("old-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    const generationBeforeRefresh = getAdminSessionGeneration();
    vi.mocked(refreshSession).mockResolvedValue({
      accessToken: "new-token",
      sessionId: "session-a",
      admin: {
        id: "admin-a",
        email: "a@example.test",
        name: "Admin A",
        role: "BUSINESS",
        businessId: "business-a",
        status: "ACTIVE",
      },
    });

    await expect(refreshAccessToken()).resolves.toBe("new-token");
    expect(getAccessToken()).toBe("new-token");
    expect(getAdminSessionPrincipal()).toEqual({
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    expect(getAdminSessionGeneration()).toBe(generationBeforeRefresh);
  });

  it("does not let an older refresh overwrite a replacement login for the same principal", async () => {
    let resolveRefresh!: (value: {
      accessToken: string;
      sessionId: string;
      admin: {
        id: string;
        email: string;
        name: string;
        role: string;
        businessId: string | null;
        status: string;
      };
    }) => void;
    setAuthenticatedAdminSession("original-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    vi.mocked(refreshSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const refresh = refreshAccessToken();
    setAuthenticatedAdminSession("replacement-login-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    resolveRefresh({
      accessToken: "stale-refreshed-token",
      sessionId: "original-session",
      admin: {
        id: "admin-a",
        email: "a@example.test",
        name: "Admin A",
        role: "BUSINESS_ADMIN",
        businessId: "business-a",
        status: "ACTIVE",
      },
    });

    await expect(refresh).rejects.toMatchObject({
      code: "SESSION_CHANGED_DURING_REFRESH",
      permanent: true,
    });
    expect(getAccessToken()).toBe("replacement-login-token");
  });

  it("does not clear a newly adopted administrator when an older refresh is rejected", async () => {
    let rejectRefresh!: (reason: unknown) => void;
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    vi.mocked(refreshSession).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectRefresh = reject;
        }),
    );

    const refresh = refreshAccessToken();
    setAuthenticatedAdminSession("admin-b-token", {
      id: "admin-b",
      role: "BUSINESS_ADMIN",
      businessId: "business-b",
    });
    rejectRefresh(
      new AdminAuthError("UNAUTHORIZED", "old refresh expired", {
        status: 401,
        permanent: true,
      }),
    );

    await expect(refresh).rejects.toMatchObject({
      code: "SESSION_CHANGED_DURING_REFRESH",
    });
    expect(getAccessToken()).toBe("admin-b-token");
    expect(getAdminSessionPrincipal()?.id).toBe("admin-b");
  });
});
