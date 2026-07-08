import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ paymentId: string }>;
}

/** 어드민 수동 환불 → spot-backend 내부 API로 프록시 (요청+승인 동시, Toss 실행). */
export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { paymentId } = await params;
  const body = await req.json().catch(() => ({}));
  return proxyBackendInternal(`/internal/payments/${paymentId}/refund`, {
    amount: body?.amount,
    reason: body?.reason,
    decidedBy: session.user.email ?? session.user.name,
  });
}
