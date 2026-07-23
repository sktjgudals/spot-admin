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

/** 칭찬 태그 수정 — label(문구)·categoryId(카테고리 이동)·sortOrder·isActive 부분 갱신 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) {
    data.label = body.label.trim();
  }
  if (typeof body.categoryId === "string" && body.categoryId) {
    const category = await prisma.praiseTagCategory.findUnique({
      where: { id: body.categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ message: "존재하지 않는 카테고리입니다" }, { status: 400 });
    }
    data.categoryId = body.categoryId;
  }
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  try {
    const updated = await prisma.praiseTag.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "태그를 찾을 수 없습니다" }, { status: 404 });
  }
}

/** 칭찬 태그 삭제 — 기존 리뷰의 태그 참조(id)는 그대로 남지만 집계에서 제외됨 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  try {
    await prisma.praiseTag.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ message: "태그를 찾을 수 없습니다" }, { status: 404 });
  }
}
