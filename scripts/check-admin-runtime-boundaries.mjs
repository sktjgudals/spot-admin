import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOTS = ["src"];
const ROOT_FILES = ["package.json", "package-lock.json", "next.config.ts", ".env.example"];
const OPTIONAL_FILES = [
  ".env",
  ".env.local",
  ".dev.vars",
  ".next/server/app-paths-manifest.json",
  ".open-next/cloudflare/next-env.mjs",
];
const TEXT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

const FORBIDDEN = [
  {
    label: "database runtime",
    pattern: /@\/lib\/prisma|generated\/prisma|@prisma\/(?:client|adapter-pg)|\bPrismaClient\b/,
  },
  { label: "database credential", pattern: /DATABASE_URL/ },
  {
    label: "internal Next.js BFF",
    pattern: /["'`]\/api\/(?:super-admin|business|party-categories)(?:\/|["'`?])/,
  },
  {
    label: "removed BFF helper",
    pattern: /@\/lib\/(?:api-auth|backend-internal|fetch-json|legacy-bff)/,
  },
  {
    label: "removed business route",
    pattern: /["'`]\/business(?:\/|["'`?])/,
  },
];

const FORBIDDEN_PATHS = [
  /^src\/app\/api\/(?:super-admin|business|party-categories)(?:\/|$)/,
  /^src\/app\/\(business\)\//,
  /^src\/generated\/prisma\//,
  /^prisma(?:\/|\.config\.)/,
];

function collectTextFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTextFiles(path, files);
    else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
}

export function collectAdminRuntimeEntries(root) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const path = join(root, sourceRoot);
    if (statSync(path).isDirectory()) collectTextFiles(path, files);
  }
  for (const rootFile of ROOT_FILES) {
    const path = join(root, rootFile);
    if (statSync(path).isFile()) files.push(path);
  }
  for (const optionalFile of OPTIONAL_FILES) {
    const path = join(root, optionalFile);
    try {
      if (statSync(path).isFile()) files.push(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return files.map((path) => ({
    path: relative(root, path),
    content: readFileSync(path, "utf8"),
  }));
}

export function findAdminBoundaryViolations(entries) {
  return entries.flatMap(({ path, content }) => {
    const pathViolations = FORBIDDEN_PATHS.filter((pattern) => pattern.test(path)).map(() => ({
      path,
      line: 1,
      label: "removed runtime path",
    }));
    const contentViolations = content.split(/\r?\n/).flatMap((line, index) =>
      FORBIDDEN.filter(({ pattern }) => pattern.test(line)).map(({ label }) => ({
        path,
        line: index + 1,
        label,
      })),
    );
    return [...pathViolations, ...contentViolations];
  });
}

export function runAdminRuntimeBoundaryCheck(root) {
  return findAdminBoundaryViolations(collectAdminRuntimeEntries(root));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const root = resolve(currentFile, "../..");
  const violations = runAdminRuntimeBoundaryCheck(root);
  if (violations.length) {
    for (const violation of violations) {
      console.error(`${violation.path}:${violation.line}: ${violation.label}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Admin runtime boundary check passed.");
  }
}
