"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { getParty, partyQueryKeys } from "@/auth/api/admin-party.api";
import {
  myPartyDetailPath,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { PartyForm } from "../../_components/PartyForm";

/**
 * BUSINESS_ADMIN edit — block if party.businessId !== me.businessId.
 */
export default function MyPartyEditPage() {
  return (
    <RoleGuard allow={["BUSINESS_ADMIN"]}>
      <Edit />
    </RoleGuard>
  );
}

function Edit() {
  const params = useParams();
  const { admin } = useAdminAuth();
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
  });
  if ("error" in scope) {
    return <p className="text-sm text-destructive">businessId 없음</p>;
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

  if (data.businessId !== scope.businessId) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive font-medium">CROSS_TENANT_BLOCKED</p>
        <p className="text-muted-foreground">
          다른 업체의 파티입니다. Nest BusinessScopeGuard도 거부합니다.
        </p>
      </div>
    );
  }

  return (
    <PartyForm
      mode="edit"
      businessId={scope.businessId}
      party={data}
      successHref={(id) => myPartyDetailPath(id)}
      cancelHref="/app/parties"
    />
  );
}
