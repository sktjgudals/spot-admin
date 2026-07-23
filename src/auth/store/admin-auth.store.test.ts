import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetAccessTokenForTests,
  clearAccessToken,
  getAccessToken,
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
});
