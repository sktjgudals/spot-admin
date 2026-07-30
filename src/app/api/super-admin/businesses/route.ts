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
import type { BusinessStatus, Prisma } from "@/generated/prisma";

/** 슈퍼 어드민 업체 선택/목록용 (ACTIVE 필터 지원) */
export async function GET(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const statusParam = req.nextUrl.searchParams.get("status");
  const where: Prisma.BusinessWhereInput = {
    deletedAt: null,
  };
  if (statusParam) {
    where.status = statusParam as BusinessStatus;
  } else {
    // 기본: 비활성 제외
    where.status = { not: "DISABLED" };
  }

  const businesses = await prisma.business.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      contactEmail: true,
    },
  });

  return NextResponse.json({ businesses });
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ message: "업체명은 필수입니다" }, { status: 400 });
  }

  const business = await prisma.business.create({
    data: {
      name: body.name,
      kind: body.kind === "INDIVIDUAL" ? "INDIVIDUAL" : "COMPANY",
      businessNumber: body.businessNumber || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      address: body.address || null,
      description: body.description || null,
      status: "PENDING",
    },
  });

  return NextResponse.json(business, { status: 201 });
}
