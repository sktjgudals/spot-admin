import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/** 쿠폰 템플릿 목록 (발급 수 포함) */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const templates = await prisma.couponTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { coupons: true } } },
  });

  return NextResponse.json(
    templates.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      discountAmount: t.discountAmount,
      validDays: t.validDays,
      kind: t.kind,
      isActive: t.isActive,
      issuedCount: t._count.coupons,
    })),
  );
}

/** 쿠폰 템플릿 생성 — title·discountAmount 필수, validDays/kind/description 선택 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ message: "쿠폰 이름을 입력하세요" }, { status: 400 });
  }
  const discountAmount = Number(body?.discountAmount);
  if (!Number.isInteger(discountAmount) || discountAmount <= 0) {
    return NextResponse.json({ message: "할인 금액을 입력하세요" }, { status: 400 });
  }

  const template = await prisma.couponTemplate.create({
    data: {
      title,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      discountAmount,
      validDays:
        Number.isInteger(body.validDays) && body.validDays > 0
          ? body.validDays
          : 30,
      kind: body.kind === "SYSTEM" ? "SYSTEM" : "CLAIMABLE",
    },
  });
  return NextResponse.json(template, { status: 201 });
}
