"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { getBusinessInsights } from "@/auth/api/business-insights.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { listParties, partyQueryKeys } from "@/auth/api/admin-party.api";
import {
  BusinessBottomNav,
  BusinessLogoHeader,
} from "@/components/business-mobile/BusinessMobileNavigation";
import { AudienceCharts } from "../_components/AudienceCharts";

export default function BusinessInsightsPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
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
    <div className="min-h-dvh bg-muted/20 pb-24 md:pb-8">
      <BusinessLogoHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-6 pt-2 sm:px-6 lg:px-8">
        <header className="mb-5 max-w-3xl">
          <p className="text-xs font-medium tracking-wide text-primary">
            {admin?.business?.name ?? "내 업체"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            누가 관심을 보였나요
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            상세 페이지에 들어왔다가 나간 사람과 즐겨찾기를 연령·성별로 모았습니다.
            개인 목록은 보여 주지 않습니다.
          </p>
        </header>

        <label className="mb-5 block max-w-md">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">파티</span>
          <select
            id="insights-party"
            name="partyId"
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            value={partyId}
            onChange={(event) => setPartyId(event.target.value)}
            disabled={parties.isLoading}
          >
            <option value="">{parties.isLoading ? "파티 불러오는 중…" : "전체 파티"}</option>
            {partyOptions.map((party) => (
              <option key={party.id} value={party.id}>
                {party.title}
              </option>
            ))}
          </select>
        </label>

        {insights.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive" role="alert">
            <span className="font-medium">인사이트를 불러오지 못했어요.</span>
            <button
              type="button"
              className="ml-2 min-h-11 rounded-lg px-2 font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              onClick={() => void insights.refetch()}
            >
              다시 시도
            </button>
          </div>
        ) : insights.isLoading || !insights.data ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-label="인사이트를 불러오는 중" aria-busy="true">
            <div className="h-56 animate-pulse rounded-2xl border bg-muted" />
            <div className="h-56 animate-pulse rounded-2xl border bg-muted" />
          </div>
        ) : insights.data.visits.totalUsers === 0 &&
          insights.data.wishlists.totalUsers === 0 ? (
          <section className="rounded-2xl border border-dashed bg-card px-4 py-12 text-center text-card-foreground">
            <p className="text-base font-semibold">
              아직 관심 기록이 없어요
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              상세를 보고 나가거나 즐겨찾기하면 연령·성별이 여기에 모여요.
            </p>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
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
