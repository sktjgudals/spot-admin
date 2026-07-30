import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ roomId: string }>;
}

/** 업체 문의 담당자 지정/해제. null이면 활성 업체 운영자 전원 알림. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json(
      { message: "업체 연결이 필요합니다" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    assigneeAdminId?: unknown;
  };
  if (
    body.assigneeAdminId !== null &&
    typeof body.assigneeAdminId !== "string"
  ) {
    return NextResponse.json(
      { message: "올바른 담당자를 선택하세요" },
      { status: 400 },
    );
  }

  const { roomId } = await params;
  return proxyBackendInternal(
    `/internal/chat/rooms/${encodeURIComponent(roomId)}/assignment`,
    {
      businessId,
      actorAdminAccountId: session.user.id,
      assigneeAdminId: body.assigneeAdminId ?? null,
    },
    "PATCH",
  );
}
