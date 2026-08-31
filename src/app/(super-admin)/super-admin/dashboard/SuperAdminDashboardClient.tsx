"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  Flag,
  MessageSquareText,
  PartyPopper,
  RefreshCw,
  ShieldAlert,
  Undo2,
  Users,
} from "lucide-react";
import { fetchAdminDashboardSummary } from "@/auth/api/admin-dashboard.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const quickQueues = [
  {
    href: "/super-admin/reports",
    title: "신고 처리",
    description: "접수된 신고를 검토하고 조치합니다.",
    icon: Flag,
  },
  {
    href: "/super-admin/refund-policy-requests?status=PENDING",
    title: "환불 정책",
    description: "업체의 정책 변경 요청을 검토합니다.",
    icon: Undo2,
  },
  {
    href: "/super-admin/inquiries",
    title: "문의 관리",
    description: "새 문의와 처리 상태를 확인합니다.",
    icon: MessageSquareText,
  },
] as const;

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="대시보드 통계를 불러오는 중" className="space-y-4">
      <span className="sr-only">대시보드 통계를 불러오는 중입니다.</span>
      <div className="h-36 animate-pulse rounded-xl border bg-muted/40" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

export function SuperAdminDashboardClient() {
  const summary = useQuery({
    queryKey: adminQueryKeys.dashboard,
    queryFn: fetchAdminDashboardSummary,
    staleTime: 30_000,
  });

  const metrics = summary.data
    ? [
        {
          title: "전체 사용자",
          value: summary.data.users.total,
          detail: `활성 로그인 제한 ${summary.data.users.blocked.toLocaleString("ko-KR")}명`,
          icon: Users,
        },
        {
          title: "등록 업체",
          value: summary.data.businesses.total,
          detail: `승인 대기 업체 ${summary.data.businesses.pending.toLocaleString("ko-KR")}개`,
          icon: Building2,
        },
        {
          title: "전체 파티",
          value: summary.data.parties.total,
          detail: "누적 생성 기준",
          icon: PartyPopper,
        },
        {
          title: "활성 로그인 제한",
          value: summary.data.users.blocked,
          detail: "현재 적용 중인 고유 사용자",
          icon: ShieldAlert,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">운영 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            지금 확인할 운영 항목과 플랫폼 규모를 한곳에서 봅니다.
          </p>
          {summary.data ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              기준 <time dateTime={summary.data.asOf}>{formatDateTime(summary.data.asOf)}</time>
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          disabled={summary.isFetching}
          onClick={() => void summary.refetch()}
        >
          <RefreshCw className={cn(summary.isFetching && "animate-spin")} />
          새로고침
        </Button>
      </header>

      {summary.isError && !summary.data ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">통계를 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                다른 관리자 기능은 계속 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.
              </p>
              <Button className="mt-3" variant="outline" onClick={() => void summary.refetch()}>
                <RefreshCw /> 다시 시도
              </Button>
            </div>
          </div>
        </div>
      ) : summary.isPending ? (
        <DashboardSkeleton />
      ) : summary.data ? (
        <>
          <section aria-labelledby="priority-queues-title" className="rounded-xl border bg-card shadow-sm shadow-foreground/[0.02]">
            <div className="border-b px-4 py-3">
              <h2 id="priority-queues-title" className="text-sm font-semibold">우선 확인</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">실제 집계가 제공되는 운영 상태만 표시합니다.</p>
            </div>
            <div className="grid gap-px bg-border md:grid-cols-2">
              <Link
                href="/app/businesses?status=PENDING"
                className="group flex min-h-24 items-center gap-3 bg-card p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-foreground">
                  <ClipboardCheck className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">승인 대기 업체 확인</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {summary.data.businesses.pending > 0 ? "업체 상태와 등록 정보를 검토해 주세요." : "현재 승인 대기 중인 업체가 없습니다."}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-semibold tabular-nums">
                    {summary.data.businesses.pending.toLocaleString("ko-KR")}개
                  </span>
                  <ArrowUpRight className="ml-auto mt-1 size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </Link>
              <div className="flex min-h-24 items-center gap-3 bg-card p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                  <ShieldAlert className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">활성 로그인 제한</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    LOGIN_BLOCK·FULL_SUSPEND가 현재 적용된 고유 사용자입니다.
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-semibold tabular-nums">
                    {summary.data.users.blocked.toLocaleString("ko-KR")}명
                  </span>
                </span>
              </div>
            </div>
          </section>

          <section aria-labelledby="platform-scale-title">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="platform-scale-title" className="text-sm font-semibold">플랫폼 현황</h2>
              {summary.isFetching ? <span className="text-xs text-muted-foreground">갱신 중…</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.title} className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/[0.02]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">{metric.title}</p>
                    <metric.icon className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                    {metric.value.toLocaleString("ko-KR")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="other-queues-title">
            <h2 id="other-queues-title" className="mb-2 text-sm font-semibold">운영 큐 바로가기</h2>
            <div className="grid gap-2 lg:grid-cols-3">
              {quickQueues.map((queue) => (
                <Link
                  key={queue.href}
                  href={queue.href}
                  className="group flex items-center gap-3 rounded-xl border bg-card p-3 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <queue.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{queue.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{queue.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                    열기 <ArrowUpRight className="size-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
