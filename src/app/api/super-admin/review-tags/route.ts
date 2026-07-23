/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/** 칭찬 태그 목록 */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const tags = await prisma.praiseTag.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      categoryId: t.categoryId,
      label: t.label,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    })),
  );
}

/** 칭찬 태그 생성 — label 필수, categoryId 필수(PraiseTagCategory 참조), sortOrder 선택 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ message: "태그 문구를 입력하세요" }, { status: 400 });
  }
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : "";
  if (!categoryId) {
    return NextResponse.json({ message: "카테고리를 선택하세요" }, { status: 400 });
  }

  const category = await prisma.praiseTagCategory.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json({ message: "존재하지 않는 카테고리입니다" }, { status: 400 });
  }

  const tag = await prisma.praiseTag.create({
    data: {
      label,
      categoryId,
      sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    },
  });
  return NextResponse.json(tag, { status: 201 });
}
