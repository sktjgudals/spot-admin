import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAccessTokenForTests,
  setAuthenticatedAdminSession,
  setRefreshedAdminSession,
} from "@/auth/store/admin-auth.store";
import {
  __resetAnalyticsTokenForTests,
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
  getAnalyticsTokenSnapshot,
  setAnalyticsAccessToken,
  subscribeAnalyticsToken,
} from "./analytics-token-store";

const PRINCIPAL = {
  id: "admin-1",
  role: "SUPER_ADMIN" as const,
  businessId: null,
};

describe("analytics token store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T00:00:00.000Z"));
    localStorage.clear();
    sessionStorage.clear();
    __resetAnalyticsTokenForTests();
    __resetAccessTokenForTests();
  });

  it("keeps the access token outside the public snapshot and browser storage", () => {
    setAnalyticsAccessToken({ accessToken: "ga-secret-token", expiresInSeconds: 3600 });

    expect(getAnalyticsAccessToken()).toBe("ga-secret-token");
    expect(getAnalyticsTokenSnapshot()).toMatchObject({
      status: "connected",
      generation: 1,
    });
    expect(JSON.stringify(getAnalyticsTokenSnapshot())).not.toContain("ga-secret-token");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("expires the token in memory and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAnalyticsToken(listener);
    setAnalyticsAccessToken({ accessToken: "short-lived", expiresInSeconds: 60 });

    vi.advanceTimersByTime(60_000);

    expect(getAnalyticsAccessToken()).toBeNull();
    expect(getAnalyticsTokenSnapshot().status).toBe("expired");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("increments the non-secret generation on reconnect and explicit disconnect", () => {
    setAnalyticsAccessToken({ accessToken: "first", expiresInSeconds: 3600 });
    clearAnalyticsAccessToken("disconnected");
    setAnalyticsAccessToken({ accessToken: "second", expiresInSeconds: 3600 });

    expect(getAnalyticsTokenSnapshot()).toMatchObject({
      status: "connected",
      generation: 3,
    });
  });

  it("clears the token when the admin session generation changes", () => {
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });

    setAuthenticatedAdminSession("other-token", { ...PRINCIPAL, id: "admin-2" });

    expect(getAnalyticsAccessToken()).toBeNull();
    expect(getAnalyticsTokenSnapshot().status).toBe("disconnected");
  });

  it("tells mounted subscribers the moment the admin session is replaced", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAnalyticsToken(listener);
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });
    listener.mockClear();

    setAuthenticatedAdminSession("other-token", { ...PRINCIPAL, id: "admin-2" });

    expect(listener).toHaveBeenCalled();
    expect(getAnalyticsTokenSnapshot().status).toBe("disconnected");
    unsubscribe();
  });

  it("keeps the token across a same-principal refresh", () => {
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });

    setRefreshedAdminSession("rotated-admin-token", PRINCIPAL);

    expect(getAnalyticsAccessToken()).toBe("ga-token");
    expect(getAnalyticsTokenSnapshot().status).toBe("connected");
  });
});
