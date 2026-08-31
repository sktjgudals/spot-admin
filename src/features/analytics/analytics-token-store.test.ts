import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAnalyticsTokenForTests,
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
  getAnalyticsTokenSnapshot,
  setAnalyticsAccessToken,
  subscribeAnalyticsToken,
} from "./analytics-token-store";

describe("analytics token store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T00:00:00.000Z"));
    localStorage.clear();
    sessionStorage.clear();
    __resetAnalyticsTokenForTests();
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
});
