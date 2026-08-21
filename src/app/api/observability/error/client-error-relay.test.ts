import { afterEach, describe, expect, it } from "vitest";
import {
  clientErrorRelayAllowedOrigin,
  consumeClientErrorRateLimit,
  parseClientErrorBody,
  resetClientErrorRateLimitForTests,
} from "./client-error-relay";

describe("client error relay", () => {
  afterEach(() => resetClientErrorRateLimitForTests());

  it("accepts only same-origin posts", () => {
    expect(
      clientErrorRelayAllowedOrigin("https://admin.dopa.ing", "admin.dopa.ing"),
    ).toBe(true);
    expect(
      clientErrorRelayAllowedOrigin("https://evil.example", "admin.dopa.ing"),
    ).toBe(false);
    expect(clientErrorRelayAllowedOrigin(null, "admin.dopa.ing")).toBe(false);
  });

  it("keeps title/path/digest and drops stack payloads", () => {
    expect(
      parseClientErrorBody({
        title: "  어드민 오류  ",
        path: "/super-admin/payments",
        digest: "abc",
        detail: "Error: secret stack\n    at leak",
      }),
    ).toEqual({
      title: "어드민 오류",
      path: "/super-admin/payments",
      digest: "abc",
    });
    expect(parseClientErrorBody({ title: "   " })).toBeNull();
  });

  it("rate-limits a single IP inside the window", () => {
    const now = 1_720_000_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(consumeClientErrorRateLimit("1.1.1.1", now + i)).toBe(true);
    }
    expect(consumeClientErrorRateLimit("1.1.1.1", now + 11)).toBe(false);
    expect(consumeClientErrorRateLimit("2.2.2.2", now + 11)).toBe(true);
  });
});
