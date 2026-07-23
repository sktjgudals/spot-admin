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

/** 쿠폰 템플릿 수정 — title·description·discountAmount·validDays·kind·isActive 부분 갱신 */
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
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if ("description" in body) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if (Number.isInteger(body.discountAmount) && body.discountAmount > 0) {
    data.discountAmount = body.discountAmount;
  }
  if (Number.isInteger(body.validDays) && body.validDays > 0) {
    data.validDays = body.validDays;
  }
  if (body.kind === "CLAIMABLE" || body.kind === "SYSTEM") data.kind = body.kind;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  try {
    const updated = await prisma.couponTemplate.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "쿠폰을 찾을 수 없습니다" }, { status: 404 });
  }
}

/** 쿠폰 템플릿 삭제 — 발급된 쿠폰이 있으면 삭제 불가(비활성화 권장) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const issued = await prisma.userCoupon.count({ where: { templateId: id } });
  if (issued > 0) {
    return NextResponse.json(
      { message: `이미 ${issued}장 발급된 쿠폰입니다. 대신 비활성화하세요` },
      { status: 409 }
    );
  }

  try {
    await prisma.couponTemplate.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ message: "쿠폰을 찾을 수 없습니다" }, { status: 404 });
  }
}
