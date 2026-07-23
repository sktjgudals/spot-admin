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

/** 업체 측 읽음 처리 (수신함 배지 리셋) */
export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 연결이 필요합니다" }, { status: 403 });
  }

  const { roomId } = await params;
  const body = (await req.json().catch(() => ({}))) as { seq?: number };
  if (!body.seq || !Number.isInteger(body.seq) || body.seq < 1) {
    return NextResponse.json({ message: "seq가 필요합니다" }, { status: 400 });
  }

  return proxyBackendInternal(
    `/internal/chat/rooms/${encodeURIComponent(roomId)}/read`,
    { seq: body.seq, businessId },
  );
}
