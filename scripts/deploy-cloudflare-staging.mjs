import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import {
  APPLE_WEB_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  STAGING_API_URL,
  STAGING_CHAT_WS_URL,
  STAGING_WORKER_NAME,
  runCloudflareOnlyCheck,
  validateWranglerConfig,
} from "./check-cloudflare-only.mjs";

export const DEPLOY_ACK = "I_ACKNOWLEDGE_STAGING_ADMIN_DEPLOY";

export function createDeployPlan(config) {
  const failures = validateWranglerConfig(config);
  if (failures.length) throw new Error(failures.join("; "));
  return {
    environment: "staging",
    worker: STAGING_WORKER_NAME,
    backend: STAGING_API_URL,
    websocket: STAGING_CHAT_WS_URL,
    productionChanges: false,
  };
}

export function assertExecuteAuthorized(value) {
  if (value !== DEPLOY_ACK) {
    throw new Error(
      `Set DOPA_ADMIN_STAGING_DEPLOY_ACK=${DEPLOY_ACK} to execute the staging deployment.`,
    );
  }
}

function run(command, args, root, envOverrides = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...envOverrides,
      WRANGLER_LOG_PATH: join(tmpdir(), "dopa-admin-wrangler.log"),
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

export function executeStagingDeploy({ root, ack }) {
  assertExecuteAuthorized(ack);
  const check = runCloudflareOnlyCheck(root);
  if (check.findings.length || check.configFailures.length) {
    throw new Error("Cloudflare-only release check failed");
  }
  const binary = join(root, "node_modules", ".bin", "opennextjs-cloudflare");
  run(binary, ["build"], root, {
    ADMIN_ENVIRONMENT: "staging",
    NEXT_PUBLIC_API_URL: STAGING_API_URL,
    NEXT_PUBLIC_CHAT_WS_URL: STAGING_CHAT_WS_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: GOOGLE_WEB_CLIENT_ID,
    NEXT_PUBLIC_APPLE_CLIENT_ID: APPLE_WEB_CLIENT_ID,
  });
  run(binary, ["deploy", "--config", "wrangler.jsonc"], root);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const root = resolve(dirname(currentFile), "..");
  const command = process.argv[2] ?? "plan";
  const config = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
  const plan = createDeployPlan(config);

  if (command === "plan") {
    console.log(JSON.stringify(plan, null, 2));
  } else if (command === "execute") {
    executeStagingDeploy({
      root,
      ack: process.env.DOPA_ADMIN_STAGING_DEPLOY_ACK,
    });
  } else {
    throw new Error("Only plan and execute are supported; production is unavailable.");
  }
}
