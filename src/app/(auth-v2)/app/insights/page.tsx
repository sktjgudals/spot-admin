"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { getBusinessInsights } from "@/auth/api/business-insights.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { listParties, partyQueryKeys } from "@/auth/api/admin-party.api";
import {
  BusinessBottomNav,
  BusinessLogoHeader,
} from "@/components/business-mobile/BusinessMobileChrome";
import { AudienceCharts } from "../_components/AudienceCharts";

export default function BusinessInsightsPage() {
  return (
    <RoleGuard allow={["BUSINESS_ADMIN"]}>
      <InsightsBody />
    </RoleGuard>
  );
}

function InsightsBody() {
  const { admin } = useAdminAuth();
  const businessId = admin?.businessId ?? "";
  const [partyId, setPartyId] = useState("");
  const insights = useQuery({
    queryKey: adminQueryKeys.insights(partyId || undefined),
    queryFn: () => getBusinessInsights(partyId || undefined),
    enabled: businessId.length > 0,
  });
  const parties = useQuery({
    queryKey: partyQueryKeys.list(businessId, "business"),
    queryFn: () => listParties(businessId, "business"),
    enabled: businessId.length > 0,
  });

  const partyOptions = useMemo(
    () => parties.data ?? [],
    [parties.data],
  );

  return (
    <div className="min-h-dvh bg-[#f7f6f9] pb-24">
      <BusinessLogoHeader />
      <main className="px-4 pb-6 pt-2">
        <header className="mb-4">
          <p className="text-[12px] font-medium tracking-[0.04em] text-[#9c6cf2]">
            {admin?.business?.name ?? "내 업체"}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#161616]">
            누가 관심을 보였나요
          </h1>
          <p className="mt-1 text-[13px] leading-6 text-[#6f6f6f]">
            상세 페이지에 들어왔다가 나간 사람과 즐겨찾기를 연령·성별로 모았습니다.
            개인 목록은 보여 주지 않습니다.
          </p>
        </header>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[12px] text-[#8a8a8a]">파티</span>
          <select
            className="h-11 w-full rounded-xl border border-[#e7e7e7] bg-white px-3 text-[14px] text-[#1f1f1f]"
            value={partyId}
            onChange={(event) => setPartyId(event.target.value)}
          >
            <option value="">전체 파티</option>
            {partyOptions.map((party) => (
              <option key={party.id} value={party.id}>
                {party.title}
              </option>
            ))}
          </select>
        </label>

        {insights.isError ? (
          <div className="rounded-2xl border border-[#f0d5d5] bg-[#fff7f7] px-4 py-5 text-[13px] text-[#b42318]">
            인사이트를 불러오지 못했어요.
            <button
              type="button"
              className="ml-2 font-medium underline"
              onClick={() => void insights.refetch()}
            >
              다시 시도
            </button>
          </div>
        ) : insights.isLoading || !insights.data ? (
          <div className="space-y-3">
            <div className="h-40 animate-pulse rounded-2xl bg-white" />
            <div className="h-40 animate-pulse rounded-2xl bg-white" />
          </div>
        ) : insights.data.visits.totalUsers === 0 &&
          insights.data.wishlists.totalUsers === 0 ? (
          <section className="rounded-2xl border border-[#ededed] bg-white px-4 py-8 text-center">
            <p className="text-[15px] font-semibold text-[#1f1f1f]">
              아직 관심 기록이 없어요
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[#8a8a8a]">
              상세를 보고 나가거나 즐겨찾기하면 연령·성별이 여기에 모여요.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            <AudienceCharts
              title="상세를 보고 나간 사람"
              breakdown={insights.data.visits}
              emptyLabel="아직 방문 기록이 없어요"
            />
            <AudienceCharts
              title="즐겨찾기한 사람"
              breakdown={insights.data.wishlists}
              emptyLabel="아직 즐겨찾기가 없어요"
            />
          </div>
        )}
      </main>
      <BusinessBottomNav />
    </div>
  );
}
