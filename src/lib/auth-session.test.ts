import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearQueryCache,
  clearSessionAndRedirect,
} from "@/lib/auth-session";

describe("clearSessionAndRedirect", () => {
  it("signOut 후 queryClient를 clear하고 hard redirect 한다", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient();
    queryClient.setQueryData(["banners"], [{ id: "1" }]);
    const assign = vi.fn();

    await clearSessionAndRedirect({
      signOut,
      queryClient,
      assign,
      href: "/login",
    });

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(queryClient.getQueryData(["banners"])).toBeUndefined();
    expect(assign).toHaveBeenCalledWith("/login");
  });
});

describe("clearQueryCache", () => {
  it("모든 캐시 엔트리를 제거한다", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["coupons"], [1]);
    clearQueryCache(queryClient);
    expect(queryClient.getQueryData(["coupons"])).toBeUndefined();
  });
});
