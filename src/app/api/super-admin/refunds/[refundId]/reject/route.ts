import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ refundId: string }>;
}

/** 환불 거절 → spot-backend 내부 API로 프록시. */
export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { refundId } = await params;
  const body = await req.json().catch(() => ({}));
  return proxyBackendInternal(`/internal/refunds/${refundId}/reject`, {
    reason: body?.reason,
    decidedBy: session.user.email ?? session.user.name,
  });
}
