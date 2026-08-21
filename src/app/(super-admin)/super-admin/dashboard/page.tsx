"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, PartyPopper, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { fetchAdminDashboardSummary } from "@/auth/api/admin-dashboard.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SuperAdminDashboard() {
  const summary = useQuery({
    queryKey: adminQueryKeys.dashboard,
    queryFn: fetchAdminDashboardSummary,
    staleTime: 30_000,
  });

  const cards = summary.data
    ? [
        {
          title: "전체 유저",
          value: summary.data.users.total,
          sub: `정지 ${summary.data.users.blocked}명`,
          icon: Users,
          color: "text-blue-500",
        },
        {
          title: "등록 업체",
          value: summary.data.businesses.total,
          sub: `승인 대기 ${summary.data.businesses.pending}개`,
          icon: Building2,
          color: "text-green-500",
        },
        {
          title: "전체 파티",
          value: summary.data.parties.total,
          sub: "누적 파티 수",
          icon: PartyPopper,
          color: "text-purple-500",
        },
        {
          title: "정지 계정",
          value: summary.data.users.blocked,
          sub: "현재 정지 상태",
          icon: ShieldAlert,
          color: "text-red-500",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">대시보드</h1>
        <p className="text-sm text-muted-foreground">Dopa 플랫폼 현황</p>
      </div>

      {summary.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <div>
              <p className="font-medium">통계를 불러오지 못했습니다.</p>
              <p className="text-sm text-muted-foreground">
                다른 관리자 기능은 계속 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.
              </p>
            </div>
            <Button variant="outline" onClick={() => void summary.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy={summary.isPending}>
          {summary.isPending
            ? Array.from({ length: 4 }, (_, index) => (
                <Card key={index} className="animate-pulse">
                  <CardContent className="space-y-3 py-6">
                    <div className="h-4 w-20 rounded bg-muted" />
                    <div className="h-8 w-16 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : cards.map((card) => (
                <Card key={card.title}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {card.title}
                    </CardTitle>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}

      {summary.data ? (
        <p className="text-xs text-muted-foreground">
          기준 시각 {formatDateTime(summary.data.asOf)}
        </p>
      ) : null}
    </div>
  );
}
