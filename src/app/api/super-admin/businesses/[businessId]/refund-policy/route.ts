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

interface TierInput {
  hoursBeforeStart: number;
  refundPercent: number;
}

function validateTiers(raw: unknown): TierInput[] | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "tiers는 배열이어야 합니다" };
  }
  if (raw.length > 20) {
    return { error: "환불 규정은 최대 20단계까지 설정할 수 있습니다" };
  }

  const tiers: TierInput[] = [];
  for (const item of raw) {
    const hours = Number(item?.hoursBeforeStart);
    const percent = Number(item?.refundPercent);
    if (!Number.isInteger(hours) || hours < 0) {
      return { error: "hoursBeforeStart는 0 이상 정수여야 합니다" };
    }
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      return { error: "refundPercent는 0~100 사이 정수여야 합니다" };
    }
    tiers.push({ hoursBeforeStart: hours, refundPercent: percent });
  }
  return tiers;
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
export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const body = await req.json().catch(() => null);
  const validated = validateTiers(body?.tiers);
  if ("error" in validated) {
    return NextResponse.json({ message: validated.error }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  const tiers = await prisma.$transaction(async (tx) => {
    await tx.refundPolicyTier.deleteMany({ where: { businessId } });
    if (validated.length > 0) {
      await tx.refundPolicyTier.createMany({
        data: validated.map((t) => ({
          businessId,
          hoursBeforeStart: t.hoursBeforeStart,
          refundPercent: t.refundPercent,
        })),
      });
    }
    return tx.refundPolicyTier.findMany({
      where: { businessId },
      orderBy: { hoursBeforeStart: "desc" },
      select: { id: true, hoursBeforeStart: true, refundPercent: true },
    });
  });

  return NextResponse.json({ businessId, tiers });
}
