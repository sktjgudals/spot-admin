import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * 업체 어드민 — 파티 Soft Close.
 * 소유권(businessId) 검증 후 isActive=false + 소켓 kick.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const { id } = await params;
  const businessId = session.user.businessId;

  const party = await prisma.party.findUnique({
    where: { id },
    select: { id: true, isActive: true, businessId: true },
  });
  if (!party) {
    return NextResponse.json({ message: "PARTY_NOT_FOUND" }, { status: 404 });
  }
  if (party.businessId !== businessId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!party.isActive) {
    return NextResponse.json({ message: "ALREADY_CLOSED", id }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : "업체에 의해 종료됨";

  await prisma.party.update({
    where: { id },
    data: {
      isActive: false,
      closedAt: new Date(),
      closedReason: reason,
    },
  });

  // 소켓 kick — 백엔드 미연결이어도 Soft Close DB 반영은 유지
  const kick = await proxyBackendInternal(
    `/internal/chat/party/${id}/close`,
    {},
  );
  if (!kick.ok) {
    console.warn(`[party-close] socket kick failed for ${id}: ${kick.status}`);
  }

  return NextResponse.json({ success: true, id, closed: true });
}
