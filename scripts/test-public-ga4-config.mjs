import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requirePublicGa4Properties } from "./public-ga4-config.mjs";

const root = new URL("../", import.meta.url);

test("accepts the public GA4 property contract used by the dashboard", () => {
  const raw = JSON.stringify([
    { id: "123456789", label: "Dopa Web", platform: "web" },
    { id: 987654321, label: "Dopa App", platform: "mixed" },
  ]);

  assert.equal(requirePublicGa4Properties(raw), raw);
});

test("fails closed before deployment when GA4 properties are absent or invalid", () => {
  assert.throws(() => requirePublicGa4Properties(undefined), /NEXT_PUBLIC_GA4_PROPERTIES/);
  assert.throws(() => requirePublicGa4Properties("not-json"), /valid JSON/);
  assert.throws(
    () =>
      requirePublicGa4Properties(
        JSON.stringify([{ id: "not-a-property", label: "Bad", platform: "web" }]),
      ),
    /property id/i,
  );
});

test("staging and production deployment paths inject validated GA4 build config", async () => {
  const [staging, workflow, packageSource, operations] = await Promise.all([
    readFile(new URL("scripts/deploy-cloudflare-staging.mjs", root), "utf8"),
    readFile(new URL(".github/workflows/deploy.yml", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("docs/OPERATIONS.md", root), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(staging, /requirePublicGa4Properties/);
  assert.match(staging, /NEXT_PUBLIC_GA4_PROPERTIES:\s*analyticsProperties/);
  assert.match(
    workflow,
    /NEXT_PUBLIC_GA4_PROPERTIES:\s*\$\{\{\s*vars\.NEXT_PUBLIC_GA4_PROPERTIES\s*\}\}/,
  );
  assert.match(
    packageJson.scripts["cf:build:production"],
    /^node scripts\/public-ga4-config\.mjs && /,
  );
  assert.match(operations, /GitHub Environment variable/);
  assert.match(operations, /build-time/);
});
