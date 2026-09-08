"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type {
  AdminUserApplicationCounts,
  AdminUserDetail,
  AdminUserSummary,
} from "@/auth/api/admin-users.api";
import { ROUTE_SUPER_ADMIN_USERS } from "@/auth/model/admin-routes";
import { renderResourceValue } from "@/components/admin/resource-console/formatters";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { dopaMediaUrl } from "@/lib/dopa-media-url";
import { formatDateTime } from "@/lib/format-date";

const APPLICATION_LABELS: Record<string, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
  // The wire sends "CANCELED" (one L). "CANCELLED" stays mapped too, in case
  // an older backend build or a cached response still spells it that way.
  CANCELED: "취소",
  CANCELLED: "취소",
  WAITLISTED: "대기열",
};

const APPLICATION_STATUS_ORDER = ["PENDING", "APPROVED", "REJECTED", "CANCELED"] as const;

/**
 * "신청 6건 (대기 1 · 승인 3 · 취소 2)" — the total first, as a fact an operator
 * can read at a glance, then only the statuses that are non-zero. `total` is
 * a count, never a label: printing `Object.entries(applications)` used to
 * walk it as if it were a fifth status and show the literal word "total".
 */
function applicationsFact(applications: AdminUserApplicationCounts): string {
  const breakdown = APPLICATION_STATUS_ORDER.map((status) => [status, applications[status]] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${APPLICATION_LABELS[status] ?? status} ${count}`)
    .join(" · ");
  return breakdown ? `신청 ${applications.total}건 (${breakdown})` : `신청 ${applications.total}건`;
}

function deviceSummary(summary: AdminUserSummary): string {
  const named = summary.devices.sessions
    .slice(0, 3)
    .map((session) => [session.platform, session.appVersion].filter(Boolean).join(" "))
    .filter((label) => label.length > 0);
  const active = `활성 세션 ${summary.devices.activeSessionCount}개`;
  return named.length > 0 ? `${active} · ${named.join(", ")}` : active;
}

function activitySummary(counts: AdminUserSummary["counts"]): string {
  return [
    applicationsFact(counts.applications),
    `결제 ${counts.payments.paidCount}/${counts.payments.count}건`,
    counts.refunds.count > 0 ? `환불 ${counts.refunds.count}건` : null,
    `신고 접수 ${counts.reportsFiled}건`,
    counts.reportsReceived.total > 0
      ? `피신고 ${counts.reportsReceived.total}건(미처리 ${counts.reportsReceived.pending})`
      : null,
    counts.activeRestrictions.length > 0
      ? `제재 ${counts.activeRestrictions.length}건`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

function consentSummary(consent: AdminUserSummary["consent"]): string {
  if (!consent) return "기록 없음";
  const version = consent.termsVersion ?? "약관";
  const agreedAt = consent.agreedAt ? formatDateTime(consent.agreedAt) : "시각 미상";
  return `${version} · ${agreedAt} · 마케팅 ${consent.marketingOptIn ? "동의" : "미동의"}`;
}

export function UserDetailHeader({
  user,
  summary,
  summaryPending,
  withdrawn,
  actions,
}: {
  user: AdminUserDetail;
  summary: AdminUserSummary | null;
  summaryPending: boolean;
  withdrawn: boolean;
  actions: ReactNode;
}) {
  const avatarSrc = user.profileImage
    ? dopaMediaUrl(user.profileImage, { width: 80 })
    : null;

  return (
    <header className="space-y-4 border-b pb-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={ROUTE_SUPER_ADMIN_USERS}
          prefetch={false}
          className="rounded-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← 사용자 목록
        </Link>
        <nav aria-label="현재 위치" className="text-xs text-muted-foreground">
          사용자 / {user.nickname}
        </nav>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Avatar size="lg">
          {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
          <AvatarFallback>{user.nickname.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {user.nickname}
            </h1>
            {user.role ? renderResourceValue(user.role, "role") : null}
            {renderResourceValue(user.status, "status")}
            {user.blocked === true ? (
              <Badge variant="outline" className="gap-1">
                <ShieldAlert aria-hidden /> 로그인 제한
              </Badge>
            ) : null}
            {withdrawn ? <Badge variant="outline">탈퇴</Badge> : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{user.id}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{user.email ?? "이메일 없음"}</span>
            {user.provider ? <Badge variant="outline">{user.provider}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      {summary ? (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="가입" value={user.createdAt ? formatDateTime(user.createdAt) : "—"} />
          <Fact label="수정" value={user.updatedAt ? formatDateTime(user.updatedAt) : "—"} />
          <Fact
            label="평점"
            value={user.averageRating === null ? "—" : user.averageRating.toFixed(1)}
          />
          <Fact
            label="마지막 활동"
            value={
              summary.profile.lastSeenAt
                ? formatDateTime(summary.profile.lastSeenAt)
                : "—"
            }
          />
          <Fact label="기기" value={deviceSummary(summary)} />
          <Fact label="활동" value={activitySummary(summary.counts)} />
          <Fact label="동의" value={consentSummary(summary.consent)} />
        </dl>
      ) : summaryPending ? (
        <div
          className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-hidden="true"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="space-y-1.5">
              <div className="h-3 w-12 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        // Not an error tone: an account whose summary projection has not been
        // built yet still has a profile worth reading.
        <p className="text-sm text-muted-foreground">요약 정보 준비 중</p>
      )}
    </header>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words tabular-nums">{value}</dd>
    </div>
  );
}
