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

/** 업체 환불 승인은 폐기되었고 자동 처리 또는 도파 수동 처리만 허용한다. */
export async function POST() {
  const { error } = await requireRole("BUSINESS");
  if (error) return error;

  return NextResponse.json(
    {
      code: "BUSINESS_REFUND_DECISION_DISABLED",
      message: "일반 취소는 자동 환불되며 예외 처리는 도파가 담당합니다.",
    },
    { status: 410 },
  );
}
