/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ paymentId: string }>;
}

/** 업체 수동 환불. 우리 업체 파티 결제만 처리 가능. */
export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const { paymentId } = await params;
  const businessId = session.user.businessId;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, party: { select: { businessId: true } } },
  });
  if (!payment) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  if (payment.party.businessId !== businessId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  return proxyBackendInternal(`/internal/payments/${paymentId}/refund`, {
    amount: body?.amount,
    reason: body?.reason,
    decidedBy: session.user.email ?? session.user.name,
  });
}
