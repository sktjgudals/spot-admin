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

/** 구 수동 승인 BFF는 폐기. 일반 환불은 자동 처리한다. */
export async function POST() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  return NextResponse.json(
    {
      code: "LEGACY_REFUND_API_DISABLED",
      message: "자동 환불 재시도 또는 Admin JWT 기반 수동 환불을 이용해 주세요.",
    },
    { status: 410 },
  );
}
