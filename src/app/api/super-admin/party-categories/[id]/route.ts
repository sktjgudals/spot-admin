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

/** 카테고리 수정 — name/status/sortOrder/isActive/iconUrl 부분 갱신 */
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
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.status === "FIXED" || body.status === "NORMAL") data.status = body.status;
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if ("iconUrl" in body) data.iconUrl = body.iconUrl || null;

  try {
    const updated = await prisma.partyCategory.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "카테고리를 찾을 수 없습니다" }, { status: 404 });
  }
}

/** 카테고리 삭제 — 연결된 파티는 categoryId만 해제(SetNull) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  try {
    await prisma.partyCategory.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ message: "카테고리를 찾을 수 없습니다" }, { status: 404 });
  }
}
