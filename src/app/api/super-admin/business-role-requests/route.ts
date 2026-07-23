/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

/** 대기 중 업체 권한 신청 목록 */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  return proxyBackendInternal("/internal/business-role-requests", undefined, "GET");
}
