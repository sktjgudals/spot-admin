"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  getParty,
  getPartyStatusHistory,
  listPartyCategories,
  partyQueryKeys,
} from "@/auth/api/admin-party.api";
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
  usePartyEditPrefetch(partyId);

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
    return <PageState tone="error">업체 연결 정보를 찾을 수 없습니다. 초대 상태를 확인해 주세요.</PageState>;
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6" aria-label="파티를 불러오는 중" aria-busy="true">
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <PageState tone="error">
        {(error as Error)?.message ?? "파티를 찾을 수 없습니다"}
      </PageState>
    );
  }

  if (data.businessId !== scope.businessId) {
    return (
      <div className="mx-auto my-8 max-w-2xl space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm" role="alert">
        <p className="text-destructive font-medium">다른 업체의 파티입니다</p>
        <p className="text-muted-foreground">
          이 계정으로 열 수 없는 파티입니다. 목록에서 다시 선택해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      <BusinessMobilePartyForm
        mode="edit"
        businessId={scope.businessId}
        party={data}
        successHref={(id) => myPartyDetailPath(id)}
        cancelHref="/app/parties"
      />
      <div className="mx-auto max-w-4xl space-y-4 px-4 pb-10 sm:px-6 lg:px-8">
        <PartyOperationsPanel party={data} />
        {data.canBusinessReview && <BusinessUserReviewsPanel partyId={data.id} />}
      </div>
    </div>
  );
}

function usePartyEditPrefetch(partyId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!partyId) return;
    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: partyQueryKeys.categories,
        queryFn: listPartyCategories,
        staleTime: 5 * 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: partyQueryKeys.statusHistory(partyId),
        queryFn: () => getPartyStatusHistory(partyId, "business"),
      }),
    ]);
  }, [partyId, queryClient]);
}

function PageState({ children, tone }: { children: React.ReactNode; tone: "error" }) {
  return (
    <div className="mx-auto my-8 max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive" role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}
