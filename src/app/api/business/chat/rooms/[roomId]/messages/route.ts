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
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ roomId: string }>;
}

/** 방 메시지 이력 — beforeSeq(과거)·afterSeq(신규 폴링) 커서 */
export async function GET(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 연결이 필요합니다" }, { status: 403 });
  }

  const { roomId } = await params;
  const search = new URLSearchParams();
  const { searchParams } = req.nextUrl;
  for (const key of ["beforeSeq", "afterSeq", "limit"]) {
    const value = searchParams.get(key);
    if (value) search.set(key, value);
  }
  // 방 소유 검증은 백엔드가 businessId로 수행
  search.set("businessId", businessId);

  return proxyBackendInternal(
    `/internal/chat/rooms/${encodeURIComponent(roomId)}/messages?${search.toString()}`,
    undefined,
    "GET",
  );
}

/** 업체 답장 전송 — 백엔드가 WS 브로드캐스트 + 오프라인 유저 FCM까지 처리 */
export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 연결이 필요합니다" }, { status: 403 });
  }

  const { roomId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    content?: string;
    clientMessageId?: string;
  };
  if (!body.content?.trim()) {
    return NextResponse.json({ message: "내용을 입력하세요" }, { status: 400 });
  }
  if (!body.clientMessageId || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientMessageId)) {
    return NextResponse.json({ message: "유효한 UUIDv7 clientMessageId가 필요합니다" }, { status: 400 });
  }

  return proxyBackendInternal(
    `/internal/chat/rooms/${encodeURIComponent(roomId)}/messages`,
    {
      adminAccountId: session.user.id,
      content: body.content,
      clientMessageId: body.clientMessageId,
      businessId,
    },
  );
}
