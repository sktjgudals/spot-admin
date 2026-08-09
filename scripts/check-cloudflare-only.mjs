import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_WORKER_NAME = "dopa-admin-staging";
export const STAGING_API_URL =
  "https://dopa-backend-staging.ceoofspot.workers.dev";
export const STAGING_CHAT_WS_URL =
  "wss://dopa-backend-staging.ceoofspot.workers.dev/v2/chat";

const FORBIDDEN_REFERENCES = [
  { label: "deleted Cloud Run host", pattern: /\.run\.app/i },
  { label: "GCP CLI", pattern: /\bgcloud\b/i },
  { label: "deleted GCP project", pattern: /spot-4749d/i },
  { label: "deleted GCP project number", pattern: /407436072297/ },
  { label: "retired chat host", pattern: /chat\.dopa\.ing/i },
  { label: "school product wording", pattern: /학교|캠퍼스/ },
];

const ACTIVE_DIRECTORIES = ["src", "public", "scripts", ".github", ".cursor"];
const ACTIVE_ROOT_FILES = [
  ".dev.vars.example",
  ".env.example",
  "README.md",
  "next.config.ts",
  "open-next.config.ts",
  "package.json",
  "wrangler.jsonc",
];
const IGNORED_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".open-next",
  "graphify-out",
  "check-cloudflare-only.mjs",
  "test-cloudflare-only.mjs",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

function isTextFile(path) {
  const index = path.lastIndexOf(".");
  return index >= 0 && TEXT_EXTENSIONS.has(path.slice(index));
}

function collectDirectoryFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectDirectoryFiles(path, files);
    else if (entry.isFile() && isTextFile(path)) files.push(path);
  }
}

export function collectActiveFiles(root) {
  const files = [];
  for (const directory of ACTIVE_DIRECTORIES) {
    const path = join(root, directory);
    try {
      if (statSync(path).isDirectory()) collectDirectoryFiles(path, files);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const file of ACTIVE_ROOT_FILES) {
    const path = join(root, file);
    try {
      if (statSync(path).isFile()) files.push(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return files;
}

export function findForbiddenReferences(entries) {
  const findings = [];
  for (const { path, content } of entries) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const reference of FORBIDDEN_REFERENCES) {
        if (reference.pattern.test(line)) {
          findings.push({
            path,
            line: index + 1,
            label: reference.label,
          });
        }
      }
    });
  }
  return findings;
}

export function validateWranglerConfig(config) {
  const failures = [];
  if (config.name !== STAGING_WORKER_NAME) {
    failures.push(`worker name must be ${STAGING_WORKER_NAME}`);
  }
  if (config.main !== ".open-next/worker.js") {
    failures.push("worker main must be .open-next/worker.js");
  }
  if (config.vars?.ADMIN_ENVIRONMENT !== "staging") {
    failures.push("ADMIN_ENVIRONMENT must be staging");
  }
  if (config.vars?.NEXT_PUBLIC_API_URL !== STAGING_API_URL) {
    failures.push("NEXT_PUBLIC_API_URL must target the staging Cloudflare backend");
  }
  if (config.vars?.NEXT_PUBLIC_CHAT_WS_URL !== STAGING_CHAT_WS_URL) {
    failures.push(
      "NEXT_PUBLIC_CHAT_WS_URL must target the staging Cloudflare WebSocket",
    );
  }
  if (!config.compatibility_flags?.includes("nodejs_compat")) {
    failures.push("nodejs_compat compatibility flag is required");
  }
  if (config.env?.production || config.routes || config.route) {
    failures.push("production environments and custom routes are not allowed yet");
  }
  return failures;
}

export function runCloudflareOnlyCheck(root) {
  const entries = collectActiveFiles(root).map((path) => ({
    path: relative(root, path),
    content: readFileSync(path, "utf8"),
  }));
  const findings = findForbiddenReferences(entries);
  const config = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
  const configFailures = validateWranglerConfig(config);
  return { findings, configFailures, checkedFiles: entries.length };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const root = resolve(dirname(currentFile), "..");
  const result = runCloudflareOnlyCheck(root);
  if (result.findings.length || result.configFailures.length) {
    for (const finding of result.findings) {
      console.error(`${finding.path}:${finding.line}: ${finding.label}`);
    }
    for (const failure of result.configFailures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(
      `Cloudflare-only release check passed (${result.checkedFiles} active files).`,
    );
  }
}
