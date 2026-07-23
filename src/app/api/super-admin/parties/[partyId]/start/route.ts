/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ partyId: string }>;
}

/** 슈퍼어드민 — 임의 파티 시작(채팅방 개설). businessId 없이 호출 → 소유 검증 생략. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { partyId } = await params;
  return proxyBackendInternal(`/internal/chat/party/${partyId}/start`, {});
}
