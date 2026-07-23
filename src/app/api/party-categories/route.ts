/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/api-auth";

/** 활성 파티 카테고리 목록 — 파티 등록 폼 선택지 (업체·슈퍼 공용) */
export async function GET() {
  const { error } = await requireAnyRole();
  if (error) return error;

  const categories = await prisma.partyCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, status: true, sortOrder: true },
  });
  return NextResponse.json(categories);
}
