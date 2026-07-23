"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
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
import { PartyForm } from "../../../../_components/PartyForm";

/**
 * SUPER_ADMIN edit — reject if party.businessId !== URL businessId (cross-tenant).
 */
export default function SuperAdminPartyEditPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
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
    queryFn: () => getParty(partyId),
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
        <p className="text-destructive font-medium">
          CROSS_TENANT_BLOCKED
        </p>
        <p className="text-muted-foreground">
          URL businessId와 파티 소속 업체가 일치하지 않습니다. Nest Guard도
          거부하므로 클라이언트가 먼저 차단합니다.
        </p>
      </div>
    );
  }

  return (
    <PartyForm
      mode="edit"
      businessId={scope.businessId}
      party={data}
      successHref={(id) => businessPartyDetailPath(scope.businessId, id)}
      cancelHref={businessPartiesPath(scope.businessId)}
    />
  );
}
