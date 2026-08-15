import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productionConfig = readFileSync(
  join(root, "wrangler.production.jsonc"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);

const PRIMARY_API = "https://api.dopa.ing";
const FALLBACK_API = "https://dopa-backend.ceoofspot.workers.dev";

test("production build freezes both direct Cloudflare API origins", () => {
  assert.match(
    productionConfig,
    new RegExp(`"NEXT_PUBLIC_API_URL"\\s*:\\s*"${PRIMARY_API}"`),
  );
  assert.match(
    productionConfig,
    new RegExp(`"NEXT_PUBLIC_API_FALLBACK_URL"\\s*:\\s*"${FALLBACK_API}"`),
  );
  assert.match(
    packageJson.scripts?.["cf:build:production"] ?? "",
    new RegExp(
      `NEXT_PUBLIC_API_URL=${PRIMARY_API}\\s+NEXT_PUBLIC_API_FALLBACK_URL=${FALLBACK_API}`,
    ),
  );
});
