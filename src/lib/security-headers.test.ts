import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  createSecurityHeaders,
} from "./security-headers";

describe("security headers", () => {
  it("blocks framing and forces HTTPS on the admin origin", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  it("keeps Google/Apple login and the Cloudflare API reachable", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("https://accounts.google.com");
    expect(CONTENT_SECURITY_POLICY).toMatch(
      /style-src[^;]*https:\/\/accounts\.google\.com/,
    );
    expect(CONTENT_SECURITY_POLICY).toContain("https://appleid.cdn-apple.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://api.dopa.ing");
    expect(CONTENT_SECURITY_POLICY).toContain("wss://api.dopa.ing");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=(self)");
  });

  it("allows read-only GA Data API reporting without enabling tracking hosts", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("https://analyticsdata.googleapis.com");
    expect(CONTENT_SECURITY_POLICY).not.toContain("https://www.google-analytics.com");
    expect(CONTENT_SECURITY_POLICY).not.toContain("https://www.googletagmanager.com");
  });

  it("allows only the known Dopa media origins for operator chat playback", () => {
    expect(CONTENT_SECURITY_POLICY).toMatch(
      /media-src 'self' blob: https:\/\/media\.dopa\.ing https:\/\/media-staging\.dopa\.ing/,
    );
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/media-src[^;]*https:\/\/\*/);
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

  it("allows only the configured local API and HMR transports in development", () => {
    const headers = createSecurityHeaders({
      environment: "development",
      apiOrigins: ["http://127.0.0.1:4010"],
      chatWebSocketUrl: "ws://127.0.0.1:4010/v2/chat",
    });

    expect(headers["Content-Security-Policy"]).toContain(
      "http://127.0.0.1:4010",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "ws://127.0.0.1:4010",
    );
    expect(headers["Content-Security-Policy"]).toContain("ws://127.0.0.1:*");
    // Chromium rejects wildcard ports on bracketed IPv6 hosts and logs a CSP
    // parse error. An explicitly configured IPv6 origin is still retained by
    // configuredConnectSources, so do not publish an invalid catch-all.
    expect(headers["Content-Security-Policy"]).not.toContain("ws://[::1]:*");
    expect(headers["Content-Security-Policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
  });

  it("does not add local development transports to the production policy", () => {
    const headers = createSecurityHeaders({
      environment: "production",
      apiOrigins: ["http://127.0.0.1:4010"],
      chatWebSocketUrl: "ws://127.0.0.1:4010/v2/chat",
    });

    expect(headers["Content-Security-Policy"]).not.toContain("127.0.0.1");
    expect(headers["Content-Security-Policy"]).toContain(
      "upgrade-insecure-requests",
    );
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
  });
});
