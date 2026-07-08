import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string }>;
}

/**
 * 업체 정보 수정 (슈퍼 어드민 전용).
 * 현재는 중개 수수료율(feeRateBps)만 다룬다. 파트너 업체는 낮게 설정.
 * feeRateBps: basis points, 0~10000 (1000 = 10%).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const body = await req.json().catch(() => null);

  const raw = body?.feeRateBps;
  if (raw === undefined || raw === null) {
    return NextResponse.json({ message: "feeRateBps는 필수입니다" }, { status: 400 });
  }
  const feeRateBps = Number(raw);
  if (!Number.isInteger(feeRateBps) || feeRateBps < 0 || feeRateBps > 10000) {
    return NextResponse.json(
      { message: "feeRateBps는 0~10000 사이 정수여야 합니다 (1000 = 10%)" },
      { status: 400 },
    );
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { feeRateBps },
    select: { id: true, name: true, feeRateBps: true },
  });

  return NextResponse.json(updated);
}
