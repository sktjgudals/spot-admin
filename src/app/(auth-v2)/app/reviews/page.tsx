"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Star } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { listParties, partyQueryKeys } from "@/auth/api/admin-party.api";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileChrome";

export default function BusinessReviewsPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <Reviews />
    </RoleGuard>
  );
}
function Reviews() {
  const { admin } = useAdminAuth();
  const businessId = admin?.businessId ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: partyQueryKeys.list(businessId, "business"),
    queryFn: () => listParties(businessId, "business"),
    enabled: businessId.length > 0,
  });
  const completed = (data ?? []).filter((party) => party.canBusinessReview || party.operationalStatus === "COMPLETED");

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-20">
      <header className="flex h-14 items-center px-4">
        <h1 className="text-[18px] font-bold">리뷰 관리</h1>
      </header>
      <p className="px-4 text-[14px] leading-[1.5] text-[#686868]">
        종료된 파티의 참가자 리뷰를 작성하고 수정할 수 있어요.
      </p>
      {isLoading && <p className="py-24 text-center text-[14px] text-[#686868]">불러오는 중…</p>}
      {error && <p className="px-4 py-20 text-center text-[14px] text-red-600">{error.message}</p>}
      {!isLoading && !error && completed.length === 0 && (
        <div className="flex min-h-[560px] flex-col items-center justify-center gap-2 px-5 text-center text-[14px] text-[#686868]">
          <Star className="size-8 text-[#c8c8c8]" />
          <p>아직 리뷰할 수 있는 종료 파티가 없어요.</p>
        </div>
      )}
      <div className="mt-5 divide-y divide-[#f5f5f5]">
        {completed.map((party) => (
          <Link key={party.id} href={`/app/parties/${encodeURIComponent(party.id)}`} className="flex items-center gap-3 px-4 py-4 hover:bg-[#f5f5f5]">
            <div className="grid size-11 place-items-center rounded-xl bg-[#f0e9fc] text-[#9c6cf2]"><Star className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-[16px]">{party.title}</strong>
              <span className="text-[13px] text-[#686868]">참가자 리뷰 작성</span>
            </div>
            <ChevronRight className="size-5 text-[#8f8f8f]" />
          </Link>
        ))}
      </div>
      <BusinessBottomNav />
    </div>
  );
}
