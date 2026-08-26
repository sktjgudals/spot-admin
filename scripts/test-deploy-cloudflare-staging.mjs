import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLE_WEB_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  STAGING_API_URL,
  STAGING_CHAT_WS_URL,
  STAGING_WORKER_NAME,
} from "./check-cloudflare-only.mjs";
import {
  DEPLOY_ACK,
  assertExecuteAuthorized,
  createDeployPlan,
} from "./deploy-cloudflare-staging.mjs";

const config = {
  name: STAGING_WORKER_NAME,
  main: ".open-next/worker.js",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    ADMIN_ENVIRONMENT: "staging",
    NEXT_PUBLIC_API_URL: STAGING_API_URL,
    NEXT_PUBLIC_CHAT_WS_URL: STAGING_CHAT_WS_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: GOOGLE_WEB_CLIENT_ID,
    NEXT_PUBLIC_APPLE_CLIENT_ID: APPLE_WEB_CLIENT_ID,
  },
};

test("deployment plan is staging-only", () => {
  assert.deepEqual(createDeployPlan(config), {
    environment: "staging",
    worker: STAGING_WORKER_NAME,
    backend: STAGING_API_URL,
    websocket: STAGING_CHAT_WS_URL,
    productionChanges: false,
  });
});

test("deployment execution requires the exact acknowledgement", () => {
  assert.throws(() => assertExecuteAuthorized("yes"), /DOPA_ADMIN_STAGING_DEPLOY_ACK/);
  assert.doesNotThrow(() => assertExecuteAuthorized(DEPLOY_ACK));
});
