import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("unused UI, legacy BFF leftovers and starter assets stay deleted", () => {
  const gone = [
    "src/components/ui/sidebar.tsx",
    "src/components/ui/dropdown-menu.tsx",
    "src/components/ui/select.tsx",
    "src/components/ui/tooltip.tsx",
    "src/components/ui/skeleton.tsx",
    "src/hooks/use-mobile.ts",
    "src/lib/banner-actions.ts",
    "src/lib/query-keys.ts",
    "src/app/(auth)/invite/[token]/BusinessSignupForm.tsx",
    "src/generated/prisma",
    "public/next.svg",
    "public/vercel.svg",
    "public/globe.svg",
    "public/file.svg",
    "public/window.svg",
  ];
  for (const rel of gone) {
    assert.equal(existsSync(join(root, rel)), false, rel);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const dep of ["recharts", "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"]) {
    assert.equal(pkg.dependencies?.[dep], undefined, dep);
  }
});
