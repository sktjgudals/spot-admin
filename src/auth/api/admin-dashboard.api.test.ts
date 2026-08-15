import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdminDashboardSummary } from "./admin-dashboard.api";

describe("fetchAdminDashboardSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the Cloudflare admin v2 endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asOf: "2026-08-15T00:00:00.000Z",
          users: { total: 2, blocked: 1 },
          businesses: { total: 3, pending: 1 },
          parties: { total: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAdminDashboardSummary();

    expect(result.parties.total).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/v2/dashboard/summary"),
      expect.objectContaining({ method: "GET" }),
    );
  });
});
