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
  params: Promise<{ applicationId: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  const { applicationId } = await params;

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { party: true },
  });

  if (!application) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  if (application.party.businessId !== businessId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (application.status !== "PENDING") {
    return NextResponse.json({ message: "이미 처리된 신청입니다" }, { status: 400 });
  }

  if (application.party.currentCount >= application.party.maxCapacity) {
    return NextResponse.json({ message: "정원이 초과되었습니다" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.application.update({
      where: { id: applicationId },
      data: { status: "APPROVED" },
    }),
    prisma.party.update({
      where: { id: application.partyId },
      data: { currentCount: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ success: true });
}
