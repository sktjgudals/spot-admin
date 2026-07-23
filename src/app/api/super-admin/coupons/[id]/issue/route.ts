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

/** 쿠폰 수동 발급 — 유저 이메일로 지정, source=ADMIN (같은 유저에게 중복 발급 가능) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ message: "유저 이메일을 입력하세요" }, { status: 400 });
  }

  const template = await prisma.couponTemplate.findUnique({
    where: { id },
    select: { validDays: true, isActive: true },
  });
  if (!template) {
    return NextResponse.json({ message: "쿠폰을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!template.isActive) {
    return NextResponse.json({ message: "비활성 쿠폰은 발급할 수 없습니다" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, nickname: true },
  });
  if (!user) {
    return NextResponse.json({ message: "해당 이메일의 유저가 없습니다" }, { status: 404 });
  }

  await prisma.userCoupon.create({
    data: {
      userId: user.id,
      templateId: id,
      source: "ADMIN",
      expiresAt: new Date(Date.now() + template.validDays * 24 * 60 * 60 * 1000),
    },
  });
  return NextResponse.json({ message: `${user.nickname}님에게 발급했습니다` }, { status: 201 });
}
