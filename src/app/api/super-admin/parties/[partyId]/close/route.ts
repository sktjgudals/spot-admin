import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ partyId: string }>;
}

/**
 * 슈퍼어드민 — 파티 Soft Close.
 * Payment/Application/ChatRoom은 보존. isActive=false + 소켓 kick.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { partyId } = await params;
  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : "관리자에 의해 종료됨";

  const party = await prisma.party.findUnique({
    where: { id: partyId },
    select: { id: true, isActive: true },
  });
  if (!party) {
    return NextResponse.json({ message: "PARTY_NOT_FOUND" }, { status: 404 });
  }
  if (!party.isActive) {
    return NextResponse.json({ message: "ALREADY_CLOSED", partyId }, { status: 200 });
  }

  await prisma.party.update({
    where: { id: partyId },
    data: {
      isActive: false,
      closedAt: new Date(),
      closedReason: reason,
    },
  });

  // 소켓 kick — 백엔드 미연결이어도 Soft Close DB 반영은 유지
  const kick = await proxyBackendInternal(
    `/internal/chat/party/${partyId}/close`,
    {},
  );
  if (!kick.ok) {
    console.warn(`[party-close] socket kick failed for ${partyId}: ${kick.status}`);
  }

  return NextResponse.json({ success: true, partyId, closed: true });
}
