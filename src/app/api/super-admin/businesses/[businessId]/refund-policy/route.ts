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

interface Params {
  params: Promise<{ businessId: string }>;
}

/** 업체 환불 규정 조회 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      refundPolicyTiers: {
        orderBy: { hoursBeforeStart: "desc" },
        select: { id: true, hoursBeforeStart: true, refundPercent: true },
      },
    },
  });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(business);
}

/**
 * 업체 환불 규정 전체 교체.
 * 전달된 tiers로 기존 단계를 모두 지우고 새로 생성한다 (트랜잭션).
 * 빈 배열이면 업체가 규정을 두지 않은 상태 → 백엔드 기본 규정(7일 100% / 3일 50%) 적용.
 */
export async function PUT(_req: NextRequest, _context: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;
  return NextResponse.json(
    {
      code: "REFUND_POLICY_DIRECT_EDIT_DISABLED",
      message:
        "업체 앱 변경 신청과 SUPER_ADMIN 승인 절차를 이용해 주세요.",
    },
    { status: 410 },
  );
}
