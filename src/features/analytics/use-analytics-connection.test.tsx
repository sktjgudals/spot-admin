import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAccessTokenForTests,
  setAuthenticatedAdminSession,
} from "@/auth/store/admin-auth.store";
import {
  __resetAnalyticsTokenForTests,
  setAnalyticsAccessToken,
} from "./analytics-token-store";

vi.mock("./google-analytics-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-analytics-oauth")>();
  return {
    ...actual,
    loadGoogleAnalyticsIdentityServices: vi.fn().mockResolvedValue(undefined),
    requestGoogleAnalyticsToken: vi.fn(),
  };
});

import { useAnalyticsConnection } from "./use-analytics-connection";

const PRINCIPAL = {
  id: "admin-1",
  role: "SUPER_ADMIN" as const,
  businessId: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAnalyticsConnection", () => {
  beforeEach(() => {
    __resetAnalyticsTokenForTests();
    __resetAccessTokenForTests();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not report a stale connected status when mounted after an admin session change with no prior subscriber", () => {
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });
    const generationBeforeChange = 1;

    // The session boundary happens while no analytics surface is mounted, so
    // there is no subscriber around yet to react to it in real time. This is
    // the exact surface Task 4's UserBehaviorPanel reads through.
    setAuthenticatedAdminSession("other-token", { ...PRINCIPAL, id: "admin-2" });

    const { result } = renderHook(
      () => useAnalyticsConnection({ googleClientId: "public-client-id", enabled: true }),
      { wrapper },
    );

    expect(result.current.token.status).toBe("disconnected");
    expect(result.current.token.generation).toBeGreaterThan(generationBeforeChange);
  });
});
