import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

/** 자기 업체 문의 담당자로 지정 가능한 활성 운영자 목록 */
export async function GET() {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json(
      { message: "업체 연결이 필요합니다" },
      { status: 403 },
    );
  }

  return proxyBackendInternal(
    `/internal/chat/assignees?businessId=${encodeURIComponent(businessId)}`,
    undefined,
    "GET",
  );
}
