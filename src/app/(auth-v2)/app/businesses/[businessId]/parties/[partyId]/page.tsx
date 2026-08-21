"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { SUPER_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  getParty,
  partyQueryKeys,
} from "@/auth/api/admin-party.api";
import {
  businessPartiesPath,
  businessPartyDetailPath,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { BusinessMobilePartyForm } from "@/components/business-mobile/BusinessMobilePartyForm";
import { PartyOperationsPanel } from "../../../../_components/PartyOperationsPanel";
import { BusinessUserReviewsPanel } from "../../../../_components/BusinessUserReviewsPanel";

/**
 * SUPER_ADMIN edit — reject if party.businessId !== URL businessId (cross-tenant).
 */
export default function SuperAdminPartyEditPage() {
  return (
    <RoleGuard allow={SUPER_ADMIN_ONLY}>
      <Edit />
    </RoleGuard>
  );
}

function Edit() {
  const params = useParams();
  const { admin } = useAdminAuth();
  const routeBusinessId = String(params.businessId ?? "");
  const partyId = String(params.partyId ?? "");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: partyQueryKeys.detail(partyId),
    queryFn: () => getParty(partyId, "super"),
    enabled: !!partyId,
  });

  if (!admin) return null;

  const scope = resolveBusinessScope({
    role: admin.role,
    profileBusinessId: admin.businessId,
    routeBusinessId,
  });
  if ("error" in scope) {
    return <p className="text-sm text-destructive">scope 오류</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        {(error as Error)?.message ?? "파티를 찾을 수 없습니다"}
      </p>
    );
  }

  // Cross-tenant: URL business must match party.businessId
  if (data.businessId !== scope.businessId) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive font-medium">업체와 파티가 일치하지 않습니다</p>
        <p className="text-muted-foreground">
          주소의 업체와 이 파티의 소속 업체가 다릅니다. 업체 파티 목록에서 다시
          열어 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BusinessMobilePartyForm
        mode="edit"
        businessId={scope.businessId}
        party={data}
        successHref={(id) => businessPartyDetailPath(scope.businessId, id)}
        cancelHref={businessPartiesPath(scope.businessId)}
      />
      <PartyOperationsPanel party={data} />
      {data.canBusinessReview && <BusinessUserReviewsPanel partyId={data.id} />}
    </div>
  );
}
