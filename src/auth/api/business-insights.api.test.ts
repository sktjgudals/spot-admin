import { afterEach, describe, expect, it, vi } from "vitest";
import { getBusinessInsights } from "./business-insights.api";

describe("getBusinessInsights", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads scoped aggregates from the live operator API", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    const payload = {
      businessId: "biz_a",
      partyId: null,
      generatedAt: 1,
      visits: {
        totalUsers: 2,
        gender: { male: 1, female: 1, unknown: 0 },
        ageBands: { "10s": 0, "20s": 1, "30s": 1, "40s": 0, "50s+": 0, unknown: 0 },
      },
      wishlists: {
        totalUsers: 1,
        gender: { male: 0, female: 1, unknown: 0 },
        ageBands: { "10s": 0, "20s": 1, "30s": 0, "40s": 0, "50s+": 0, unknown: 0 },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getBusinessInsights();

    expect(result.visits.totalUsers).toBe(payload.visits.totalUsers);
    expect(result.wishlists.gender.female).toBe(payload.wishlists.gender.female);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/businesses/me/insights");
  });
});
