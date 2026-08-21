import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "./security-headers";

describe("security headers", () => {
  it("blocks framing and forces HTTPS on the admin origin", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  it("keeps Google/Apple login and the Cloudflare API reachable", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("https://accounts.google.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://appleid.cdn-apple.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://api.dopa.ing");
    expect(CONTENT_SECURITY_POLICY).toContain("wss://api.dopa.ing");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=(self)");
  });

  it("publishes the same policy on static assets", () => {
    const headersFile = readFileSync(
      resolve(process.cwd(), "public/_headers"),
      "utf8",
    );
    expect(headersFile).toContain(CONTENT_SECURITY_POLICY);
    expect(headersFile).toContain("X-Frame-Options: DENY");
    expect(headersFile).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
  });
});
