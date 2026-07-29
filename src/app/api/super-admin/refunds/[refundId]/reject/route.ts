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

/** 구 수동 거절 BFF는 폐기. 정책 외 환불은 감사 로그가 남는 경로만 사용한다. */
export async function POST() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  return NextResponse.json(
    {
      code: "LEGACY_REFUND_API_DISABLED",
      message: "Admin JWT 기반 환불 처리 API를 이용해 주세요.",
    },
    { status: 410 },
  );
}
