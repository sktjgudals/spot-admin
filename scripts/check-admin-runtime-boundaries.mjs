import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVE_ADMIN_FILES = [
  "src/app/(super-admin)/super-admin/dashboard/page.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/auth/api/admin-dashboard.api.ts",
  "src/auth/provider/AdminAuthProvider.tsx",
  "src/components/layout/AdminSidebar.tsx",
  "src/middleware.ts",
];

const FORBIDDEN = [
  { label: "Prisma runtime import", pattern: /@\/lib\/prisma|generated\/prisma|@prisma\/client/ },
  { label: "database credential", pattern: /DATABASE_URL/ },
  { label: "legacy super-admin BFF", pattern: /["'`]\/api\/super-admin\// },
];

export function findAdminBoundaryViolations(entries) {
  return entries.flatMap(({ path, content }) =>
    content.split(/\r?\n/).flatMap((line, index) =>
      FORBIDDEN.filter(({ pattern }) => pattern.test(line)).map(({ label }) => ({
        path,
        line: index + 1,
        label,
      })),
    ),
  );
}

export function runAdminRuntimeBoundaryCheck(root) {
  const entries = ACTIVE_ADMIN_FILES.map((path) => ({
    path,
    content: readFileSync(resolve(root, path), "utf8"),
  }));
  return findAdminBoundaryViolations(entries);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const root = resolve(dirname(currentFile), "..");
  const violations = runAdminRuntimeBoundaryCheck(root);
  if (violations.length) {
    for (const violation of violations) {
      console.error(`${relative(root, resolve(root, violation.path))}:${violation.line}: ${violation.label}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Admin runtime boundary check passed.");
  }
}
