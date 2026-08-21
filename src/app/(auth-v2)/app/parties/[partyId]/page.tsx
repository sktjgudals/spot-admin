"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { getParty, partyQueryKeys } from "@/auth/api/admin-party.api";
import {
  myPartyDetailPath,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { BusinessMobilePartyForm } from "@/components/business-mobile/BusinessMobilePartyForm";
import { PartyOperationsPanel } from "../../_components/PartyOperationsPanel";
import { BusinessUserReviewsPanel } from "../../_components/BusinessUserReviewsPanel";

/**
 * BUSINESS_ADMIN edit — block if party.businessId !== me.businessId.
 */
export default function MyPartyEditPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
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
        <p className="text-destructive font-medium">다른 업체의 파티입니다</p>
        <p className="text-muted-foreground">
          이 계정으로 열 수 없는 파티입니다. 목록에서 다시 선택해 주세요.
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
        successHref={(id) => myPartyDetailPath(id)}
        cancelHref="/app/parties"
      />
      <PartyOperationsPanel party={data} />
      {data.canBusinessReview && <BusinessUserReviewsPanel partyId={data.id} />}
    </div>
  );
}
