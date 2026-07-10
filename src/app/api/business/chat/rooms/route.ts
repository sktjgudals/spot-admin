import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

/** 업체 DM 수신함 방 목록 (내 업체 것만) */
export async function GET() {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 연결이 필요합니다" }, { status: 403 });
  }

  return proxyBackendInternal(
    `/internal/chat/rooms?businessId=${encodeURIComponent(businessId)}`,
    undefined,
    "GET",
  );
}
