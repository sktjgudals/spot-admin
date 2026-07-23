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
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const businessId =
    typeof body?.businessId === "string" && body.businessId
      ? body.businessId
      : undefined;

  return proxyBackendInternal(`/internal/business-role-requests/${id}/approve`, {
    reviewedBy: session.user.id ?? session.user.email ?? "super-admin",
    ...(businessId ? { businessId } : {}),
  });
}
