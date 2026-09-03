import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cookieCapableOrigins,
  resetHealthProbeCacheForTests,
  selectReachableAdminApiBaseUrl,
} from "./admin-api-origin";

const PRIMARY = "https://api.dopa.ing";
const FALLBACK = "https://dopa-backend.ceoofspot.workers.dev";

describe("admin API origin", () => {
  const realLocation = window.location;
  beforeEach(() => {
    resetHealthProbeCacheForTests();
    vi.stubEnv("NEXT_PUBLIC_API_URL", PRIMARY);
    vi.stubEnv("NEXT_PUBLIC_API_FALLBACK_URL", FALLBACK);
    window.localStorage.clear();
    // The app is served from admin.dopa.ing; jsdom defaults to localhost.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://admin.dopa.ing/app"),
    });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps only hosts that can carry the app's session cookie", () => {
    // Session cookies are Domain=.dopa.ing. A workers.dev host can neither
    // receive them nor set them, so a login there "succeeds" and every reload
    // logs the operator out.
    expect(cookieCapableOrigins([PRIMARY, FALLBACK], "admin.dopa.ing")).toEqual([
      PRIMARY,
    ]);
    expect(cookieCapableOrigins([PRIMARY, FALLBACK], "localhost")).toEqual([
      PRIMARY,
      FALLBACK,
    ]);
  });

  it("ignores a remembered fallback origin and forgets it", async () => {
    window.localStorage.setItem("dopa-admin-api-origin", FALLBACK);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const origin = await selectReachableAdminApiBaseUrl();

    expect(origin).toBe(PRIMARY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${PRIMARY}/health`);
    expect(window.localStorage.getItem("dopa-admin-api-origin")).toBe(PRIMARY);
  });

  it("does not fall over to a cookie-blind host when the primary probe fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    await expect(selectReachableAdminApiBaseUrl()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});
