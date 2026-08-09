import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGING_API_URL,
  STAGING_CHAT_WS_URL,
  STAGING_WORKER_NAME,
  findForbiddenReferences,
  validateWranglerConfig,
} from "./check-cloudflare-only.mjs";

function validConfig() {
  return {
    name: STAGING_WORKER_NAME,
    main: ".open-next/worker.js",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      ADMIN_ENVIRONMENT: "staging",
      NEXT_PUBLIC_API_URL: STAGING_API_URL,
      NEXT_PUBLIC_CHAT_WS_URL: STAGING_CHAT_WS_URL,
    },
  };
}

test("finds retired infrastructure and school wording", () => {
  const findings = findForbiddenReferences([
    {
      path: "active.ts",
      content: "gcloud run deploy\nconst label = '학교';\nhttps://old.run.app",
    },
  ]);
  assert.deepEqual(
    findings.map(({ label }) => label),
    ["GCP CLI", "school product wording", "deleted Cloud Run host"],
  );
});

test("accepts an exact staging-only Worker configuration", () => {
  assert.deepEqual(validateWranglerConfig(validConfig()), []);
});

test("rejects a production environment and mismatched backend", () => {
  const config = validConfig();
  config.env = { production: {} };
  config.vars.NEXT_PUBLIC_API_URL = "https://api.dopa.ing";
  assert.deepEqual(validateWranglerConfig(config), [
    "NEXT_PUBLIC_API_URL must target the staging Cloudflare backend",
    "production environments and custom routes are not allowed yet",
  ]);
});
