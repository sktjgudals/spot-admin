import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetAccessTokenForTests,
  clearAccessToken,
  getAdminSessionPrincipal,
  getAdminSessionGeneration,
  getAccessToken,
  setRefreshedAdminSession,
  setAuthenticatedAdminSession,
  setAccessToken,
  subscribeAccessToken,
} from "@/auth/store/admin-auth.store";

describe("admin-auth.store", () => {
  beforeEach(() => {
    __resetAccessTokenForTests();
  });

  it("keeps token only in memory", () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken("at-xyz");
    expect(getAccessToken()).toBe("at-xyz");
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it("notifies subscribers", () => {
    let n = 0;
    const unsub = subscribeAccessToken(() => {
      n += 1;
    });
    setAccessToken("a");
    setAccessToken("b");
    unsub();
    setAccessToken("c");
    expect(n).toBe(2);
  });

  it("stores the authenticated principal atomically and clears it with the token", () => {
    setAuthenticatedAdminSession("at-xyz", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });

    expect(getAccessToken()).toBe("at-xyz");
    expect(getAdminSessionPrincipal()).toEqual({
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });

    clearAccessToken();

    expect(getAccessToken()).toBeNull();
    expect(getAdminSessionPrincipal()).toBeNull();
  });

  it("notifies once when adopting a token and principal together", () => {
    let notifications = 0;
    subscribeAccessToken(() => {
      notifications += 1;
    });

    setAuthenticatedAdminSession("at-xyz", {
      id: "admin-a",
      role: "SUPER_ADMIN",
      businessId: null,
    });

    expect(notifications).toBe(1);
  });

  it("advances only authorization-boundary generations, not same-principal refreshes", () => {
    const principal = {
      id: "admin-a",
      role: "BUSINESS_ADMIN" as const,
      businessId: "business-a",
    };

    expect(getAdminSessionGeneration()).toBe(0);
    setAuthenticatedAdminSession("login-token", principal);
    expect(getAdminSessionGeneration()).toBe(1);

    setAuthenticatedAdminSession("login-token", principal);
    expect(getAdminSessionGeneration()).toBe(1);

    setRefreshedAdminSession("refreshed-token", principal);
    expect(getAdminSessionGeneration()).toBe(1);

    setAuthenticatedAdminSession("replacement-login-token", principal);
    expect(getAdminSessionGeneration()).toBe(2);

    clearAccessToken();
    expect(getAdminSessionGeneration()).toBe(3);
    clearAccessToken();
    expect(getAdminSessionGeneration()).toBe(3);
  });
});
