import { describe, expect, it } from "vitest";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { shouldRetryAdminQuery } from "./should-retry-admin-query";

describe("shouldRetryAdminQuery", () => {
  it("does not retry 4xx or permanent auth failures", () => {
    expect(
      shouldRetryAdminQuery(0, new AdminAuthError("HTTP_ERROR", "no", { status: 403 })),
    ).toBe(false);
    expect(
      shouldRetryAdminQuery(0, new AdminAuthError("UNAUTHORIZED", "no", { status: 401, permanent: true })),
    ).toBe(false);
  });

  it("retries server and unknown failures twice", () => {
    expect(
      shouldRetryAdminQuery(0, new AdminAuthError("HTTP_ERROR", "down", { status: 503 })),
    ).toBe(true);
    expect(shouldRetryAdminQuery(2, new Error("boom"))).toBe(false);
  });
});
