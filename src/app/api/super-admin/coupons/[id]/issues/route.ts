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
import { requireRole } from "@/lib/api-auth";

/** 템플릿별 최근 발급 이력 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const template = await prisma.couponTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json({ message: "쿠폰을 찾을 수 없습니다" }, { status: 404 });
  }

  const issues = await prisma.userCoupon.findMany({
    where: { templateId: id },
    orderBy: { issuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      source: true,
      issuedAt: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { email: true, nickname: true } },
    },
  });

  return NextResponse.json(
    issues.map((c) => ({
      id: c.id,
      status: c.status,
      source: c.source,
      issuedAt: c.issuedAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      usedAt: c.usedAt?.toISOString() ?? null,
      email: c.user.email,
      nickname: c.user.nickname,
    }))
  );
}
