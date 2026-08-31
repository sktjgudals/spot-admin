import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { withSentryConfig } from "@sentry/nextjs";
import { RUNTIME_SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  // Browsers and CI use both loopback spellings; keep Turbopack's dev-origin
  // protection while explicitly accepting the numeric hostname.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(RUNTIME_SECURITY_HEADERS).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "dopa-q2",
  project: process.env.SENTRY_PROJECT || "dopa-admin",
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  errorHandler(error) {
    console.warn("[sentry] source map upload skipped:", error.message);
  },
});

initOpenNextCloudflareForDev();
