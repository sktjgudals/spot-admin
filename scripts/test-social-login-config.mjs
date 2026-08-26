import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { APPLE_WEB_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "./check-cloudflare-only.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("Cloudflare builds inline both production social-login clients", () => {
  for (const scriptName of ["cf:build", "cf:build:production"]) {
    const script = packageJson.scripts[scriptName];
    assert.match(script, new RegExp(`NEXT_PUBLIC_GOOGLE_CLIENT_ID=${GOOGLE_WEB_CLIENT_ID}`));
    assert.match(script, new RegExp(`NEXT_PUBLIC_APPLE_CLIENT_ID=${APPLE_WEB_CLIENT_ID}`));
  }
});

test("Wrangler environments publish the same social-login clients", () => {
  for (const configName of ["wrangler.jsonc", "wrangler.production.jsonc"]) {
    const config = readFileSync(join(root, configName), "utf8");
    assert.match(config, new RegExp(`"NEXT_PUBLIC_GOOGLE_CLIENT_ID": "${GOOGLE_WEB_CLIENT_ID}"`));
    assert.match(config, new RegExp(`"NEXT_PUBLIC_APPLE_CLIENT_ID": "${APPLE_WEB_CLIENT_ID}"`));
  }
});
