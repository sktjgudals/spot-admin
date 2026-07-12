import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ id: string }>;
}

/** 업체 어드민 — 자기 파티 시작(채팅방 개설). 소유 검증은 백엔드가 businessId로 수행. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 정보가 없습니다" }, { status: 400 });
  }

  const { id } = await params;
  return proxyBackendInternal(`/internal/chat/party/${id}/start`, { businessId });
}
