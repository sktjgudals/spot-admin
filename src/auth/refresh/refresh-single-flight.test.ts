import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRefreshFlightForTests,
  isRefreshInFlight,
  refreshAccessToken,
} from "@/auth/refresh/refresh-single-flight";
import { __resetAccessTokenForTests, getAccessToken } from "@/auth/store/admin-auth.store";

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
});
