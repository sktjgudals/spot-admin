import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

/** 대기 중 업체 권한 신청 목록 */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  return proxyBackendInternal("/internal/business-role-requests", undefined, "GET");
}
