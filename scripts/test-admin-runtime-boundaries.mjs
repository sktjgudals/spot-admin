import assert from "node:assert/strict";
import test from "node:test";
import { findAdminBoundaryViolations } from "./check-admin-runtime-boundaries.mjs";

test("rejects Prisma, DATABASE_URL and legacy BFF access", () => {
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
    ["Prisma runtime import", "legacy super-admin BFF", "database credential"],
  );
});

test("accepts admin/v2 API access", () => {
  assert.deepEqual(
    findAdminBoundaryViolations([
      { path: "good.ts", content: 'adminFetchJson("/admin/v2/dashboard/summary")' },
    ]),
    [],
  );
});
