import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  return proxyBackendInternal(`/internal/business-role-requests/${id}/reject`, {
    reviewedBy: session.user.id ?? session.user.email ?? "super-admin",
  });
}
