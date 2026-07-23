"use client";

import { useParams } from "next/navigation";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  businessDetailPath,
  businessPartiesPath,
  businessPartyDetailPath,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { PartyListPanel } from "../../../_components/PartyListPanel";

/**
 * SUPER_ADMIN — businessId from URL → Nest path.
 * /app/businesses/:businessId/parties
 */
export default function SuperAdminBusinessPartiesPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <ScopedList />
    </RoleGuard>
  );
}

function ScopedList() {
  const params = useParams();
  const { admin } = useAdminAuth();
  const routeBusinessId = String(params.businessId ?? "");

  if (!admin) return null;

  const scope = resolveBusinessScope({
    role: admin.role,
    profileBusinessId: admin.businessId,
    routeBusinessId,
  });

  if ("error" in scope) {
    return (
      <p className="text-sm text-destructive">
        business scope를 URL에서 확인할 수 없습니다.
      </p>
    );
  }

  const { businessId } = scope;

  return (
    <PartyListPanel
      businessId={businessId}
      title="파티 (SUPER_ADMIN)"
      description="URL businessId → GET /admin/v2/businesses/:businessId/parties"
      partyHref={(partyId) => businessPartyDetailPath(businessId, partyId)}
      createHref={`${businessPartiesPath(businessId)}/new`}
      backHref={businessDetailPath(businessId)}
      backLabel="← 업체 상세"
    />
  );
}
