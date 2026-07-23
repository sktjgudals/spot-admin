/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ refundId: string }>;
}

/** 업체 환불 승인. 우리 업체 파티 결제의 환불만 처리 가능. */
export async function POST(_req: Request, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const { refundId } = await params;
  const businessId = session.user.businessId;

  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    select: { id: true, payment: { select: { party: { select: { businessId: true } } } } },
  });
  if (!refund) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  if (refund.payment.party.businessId !== businessId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return proxyBackendInternal(`/internal/refunds/${refundId}/approve`, {
    decidedBy: session.user.email ?? session.user.name,
  });
}
