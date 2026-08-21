import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("production Worker is not published on workers.dev or preview URLs", () => {
  const config = readFileSync(join(root, "wrangler.production.jsonc"), "utf8");
  assert.match(config, /"workers_dev"\s*:\s*false/);
  assert.match(config, /"preview_urls"\s*:\s*false/);
  assert.doesNotMatch(config, /"workers_dev"\s*:\s*true/);
  assert.doesNotMatch(config, /"preview_urls"\s*:\s*true/);
});

test("static assets send clickjacking and transport headers", () => {
  const headers = readFileSync(join(root, "public/_headers"), "utf8");
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
});

test("Next config uploads source maps only when a Sentry token is present", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(config, /withSentryConfig/);
  assert.match(config, /sourcemaps:\s*\{[\s\S]*disable:\s*!process\.env\.SENTRY_AUTH_TOKEN/);
});
