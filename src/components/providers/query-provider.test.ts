import { describe, expect, it } from "vitest";
import { createAdminQueryClient } from "./query-provider";

describe("createAdminQueryClient", () => {
  it("uses a bounded operations-dashboard cache policy", () => {
    const client = createAdminQueryClient();
    const queries = client.getDefaultOptions().queries;

    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.gcTime).toBe(5 * 60_000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.refetchOnReconnect).toBe(true);
  });
});

