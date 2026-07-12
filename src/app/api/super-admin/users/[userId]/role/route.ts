import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
type UserRole = (typeof ROLES)[number];

function isRole(v: unknown): v is UserRole {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** 유저 권한 변경 — USER(일반) · ADMIN(업체 어드민) · SUPER_ADMIN(슈퍼 어드민) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!isRole(body?.role)) {
    return NextResponse.json({ message: "잘못된 권한 값" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ message: "USER_NOT_FOUND" }, { status: 404 });
  }

  const role = body.role;
  // 업체 어드민(ADMIN) 지정 시 담당 업체 필수 — 나머지 권한은 업체 연결 해제
  let businessId: string | null = null;
  if (role === "ADMIN") {
    if (typeof body?.businessId !== "string" || !body.businessId) {
      return NextResponse.json({ message: "업체를 선택해주세요" }, { status: 400 });
    }
    const biz = await prisma.business.findUnique({
      where: { id: body.businessId },
      select: { id: true },
    });
    if (!biz) {
      return NextResponse.json({ message: "업체를 찾을 수 없습니다" }, { status: 404 });
    }
    businessId = biz.id;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role, businessId },
  });

  return NextResponse.json({ success: true, role, businessId });
}
