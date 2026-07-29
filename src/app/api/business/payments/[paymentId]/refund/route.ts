/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

/** 업체는 환불 승인·수동 환불을 직접 실행할 수 없다. */
export async function POST() {
  const { error } = await requireRole("BUSINESS");
  if (error) return error;

  return NextResponse.json(
    {
      code: "BUSINESS_REFUND_DECISION_DISABLED",
      message: "환불 처리는 도파 관리자 경로를 이용해 주세요.",
    },
    { status: 410 },
  );
}
