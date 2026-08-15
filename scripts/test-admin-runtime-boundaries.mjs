import assert from "node:assert/strict";
import test from "node:test";
import { findAdminBoundaryViolations } from "./check-admin-runtime-boundaries.mjs";

test("rejects database runtimes, credentials and internal BFF access", () => {
  const violations = findAdminBoundaryViolations([
    {
      path: "bad.ts",
      content: [
        'import { prisma } from "@/lib/prisma";',
        'fetch("/api/super-admin/users")',
        "const secret = process.env.DATABASE_URL",
      ].join("\n"),
    },
  ]);

  assert.deepEqual(
    violations.map(({ label }) => label),
    ["database runtime", "internal Next.js BFF", "database credential"],
  );
});

test("rejects removed route trees even when their files contain no forbidden call", () => {
  const violations = findAdminBoundaryViolations([
    { path: "src/app/api/business/forms/route.ts", content: "export const GET = () => null" },
  ]);
  assert.deepEqual(violations.map(({ label }) => label), ["removed runtime path"]);
});

test("accepts admin/v2 API access", () => {
  assert.deepEqual(
    findAdminBoundaryViolations([
      { path: "good.ts", content: 'adminFetchJson("/admin/v2/dashboard/summary")' },
    ]),
    [],
  );
});
