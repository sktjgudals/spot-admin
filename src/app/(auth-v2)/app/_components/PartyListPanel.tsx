"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, UserRound } from "lucide-react";
import {
  listParties,
  partyQueryKeys,
  type AdminParty,
} from "@/auth/api/admin-party.api";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatPartyDate } from "@/lib/format-date";
import { PartyStatusBadge } from "./PartyOperationsPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  BusinessBottomNav,
  BusinessLogoHeader,
} from "@/components/business-mobile/BusinessMobileChrome";
import { cn } from "@/lib/utils";

type Props = {
  /** Effective API businessId (already resolved — never raw untrusted URL for BA). */
  businessId: string;
  /** Build edit/detail href for a party */
  partyHref: (partyId: string) => string;
  /** Create form href */
  createHref: string;
  /** Optional back link */
  backHref?: string;
  backLabel?: string;
  title?: string;
  description?: string;
  variant?: "desktop" | "business-mobile";
};

/**
 * Shared party list for SUPER_ADMIN (URL scope) and BUSINESS_ADMIN (me scope).
 * Always calls the Cloudflare API with the provided businessId only.
 */
export function PartyListPanel({
  businessId,
  partyHref,
  createHref,
  backHref,
  backLabel = "← 뒤로",
  title = "파티",
  description,
  variant = "desktop",
}: Props) {
  const { admin } = useAdminAuth();
  const scope = admin?.role === "SUPER_ADMIN" ? "super" : "business";
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: partyQueryKeys.list(businessId, scope),
    queryFn: () => listParties(businessId, scope),
    enabled: !!businessId,
  });

  const rows: AdminParty[] = data ?? [];

  if (variant === "business-mobile") {
    return (
      <BusinessPartyList
        rows={rows}
        isLoading={isLoading}
        isError={isError}
        error={error}
        partyHref={partyHref}
        createHref={createHref}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <p className="text-xs text-muted-foreground font-mono break-all mt-1">
            businessId={businessId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backHref && (
            <Button
              nativeButton={false}
              size="sm"
              variant="ghost"
              render={<Link href={backHref} />}
            >
              {backLabel}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            새로고침
          </Button>
          <Button nativeButton={false} size="sm" render={<Link href={createHref} />}>
            <Plus className="w-4 h-4 mr-1" />
            파티 등록
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          {(error as Error)?.message ??
            "목록을 불러오지 못했습니다 (업체가 비활성일 수 있음)"}
        </p>
      )}

      {!isLoading && !isError && (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>일시</TableHead>
                <TableHead>장소</TableHead>
                <TableHead className="text-center">정원</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-36"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    파티가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={partyHref(p.id)}
                      className="font-medium hover:underline"
                    >
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(p.date)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                    {p.location}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {p.currentCount}/{p.maxCapacity}
                  </TableCell>
                  <TableCell>
                    <PartyStatusBadge status={p.operationalStatus} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        nativeButton={false}
                        size="sm"
                        variant="ghost"
                        render={<Link href={partyHref(p.id)} />}
                      >
                        수정
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type PartyTab = "ALL" | "WAITING" | "RECRUITING" | "ENDED";

const partyTabs: Array<{ id: PartyTab; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "WAITING", label: "대기" },
  { id: "RECRUITING", label: "모집중" },
  { id: "ENDED", label: "종료" },
];

function partyTabFor(status: AdminParty["operationalStatus"]): PartyTab {
  if (status === "DRAFT") return "WAITING";
  if (status === "RECRUITING" || status === "CONFIRMED") return "RECRUITING";
  return "ENDED";
}

function partyBadge(status: AdminParty["operationalStatus"]): {
  label: string;
  className: string;
} {
  const tab = partyTabFor(status);
  if (tab === "RECRUITING") {
    return { label: "모집중", className: "bg-[#f0e9fc] text-[#9c6cf2]" };
  }
  if (tab === "WAITING") {
    return { label: "대기", className: "bg-[#f5f5f5] text-[#686868]" };
  }
  return { label: "종료", className: "bg-[#f5f5f5] text-[#686868]" };
}

function BusinessPartyList({
  rows,
  isLoading,
  isError,
  error,
  partyHref,
  createHref,
}: {
  rows: AdminParty[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  partyHref: (partyId: string) => string;
  createHref: string;
}) {
  const { admin } = useAdminAuth();
  const [tab, setTab] = useState<PartyTab>("ALL");
  const visible = useMemo(
    () => (tab === "ALL" ? rows : rows.filter((party) => partyTabFor(party.operationalStatus) === tab)),
    [rows, tab],
  );
  const businessName = admin?.business?.name ?? admin?.name ?? "업체";

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-24">
      <BusinessLogoHeader />
      <section className="flex items-center gap-3 px-4 pt-2">
        <div className="grid size-[50px] shrink-0 place-items-center rounded-full border border-[#dedede] bg-[#f5f5f5] text-[#b8b8b8]">
          <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} />
        </div>
        <h1 className="min-w-0 text-[20px] font-bold leading-[1.5]">
          <span className="block truncate">{businessName}</span>
          <span className="block">관리자님 안녕하세요!</span>
        </h1>
      </section>

      <section className="mt-10">
        <h2 className="px-4 text-[18px] font-bold leading-[1.5]">내 파티 목록</h2>
        <div className="mt-3 flex gap-1 px-4" role="tablist" aria-label="파티 상태">
          {partyTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "border-b-2 px-2 pb-3 text-[16px] leading-[1.5] transition-colors",
                tab === item.id
                  ? "border-[#2d2d2d] font-bold text-[#2d2d2d]"
                  : "border-transparent font-normal text-[#8f8f8f]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="min-h-[420px]">
        {isLoading && (
          <p className="px-4 py-20 text-center text-[14px] text-[#686868]">불러오는 중…</p>
        )}
        {isError && (
          <p className="px-4 py-20 text-center text-[14px] text-red-600">
            {error?.message ?? "파티 목록을 불러오지 못했습니다."}
          </p>
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <div className="flex min-h-[430px] flex-col items-center justify-center px-4 text-center text-[14px] leading-[1.5] text-[#686868]">
            <p>아직 등록한 파티가 없어요.</p>
            <p>새로운 파티를 DoPa에서 등록해보세요.</p>
          </div>
        )}
        {!isLoading && !isError && visible.length > 0 && (
          <div className="divide-y divide-[#f5f5f5]">
            {visible.map((party) => {
              const badge = partyBadge(party.operationalStatus);
              const pending = party.pendingApplicationCount;
              return (
                <article key={party.id} className="space-y-2 px-4 py-3">
                  <span className={cn("inline-flex rounded-lg px-3 py-1 text-[12px]", badge.className)}>
                    {badge.label}
                  </span>
                  <Link href={partyHref(party.id)} className="flex items-center gap-3">
                    <div className="h-[74px] w-[94px] shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#f5f5f5_25%,#fff_25%,#fff_50%,#f5f5f5_50%,#f5f5f5_75%,#fff_75%)] bg-[length:16px_16px]">
                      {party.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed/public remote media host is runtime data.
                        <img src={party.coverImage} alt="" className="size-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <h3 className="min-w-0 flex-1 truncate text-[16px] font-bold leading-[1.5]">
                          {party.title}
                        </h3>
                        <ChevronRight className="size-4 shrink-0 text-[#8f8f8f]" />
                      </div>
                      <p className="truncate text-[14px] leading-[1.5] text-[#686868]">
                        {party.location} · {formatPartyDate(party.startsAt ?? party.date)}
                      </p>
                      <p className="text-[14px] leading-[1.5] text-[#686868]">
                        모집 {party.maxCapacity}명 · 대기 {pending ?? "-"}명 · 확정 {party.currentCount}명
                      </p>
                    </div>
                  </Link>
                  <div className="flex h-10 items-center text-[14px] text-[#686868]">
                    <Link
                      href={`/app/parties/${encodeURIComponent(party.id)}/applications`}
                      className="grid h-full flex-1 place-items-center rounded-xl hover:bg-[#f5f5f5]"
                    >
                      신청자 현황
                    </Link>
                    <span className="h-3 w-px bg-[#dedede]" aria-hidden />
                    <Link
                      href={`/app/parties/${encodeURIComponent(party.id)}/check-in`}
                      className="grid h-full flex-1 place-items-center rounded-xl hover:bg-[#f5f5f5]"
                    >
                      QR 체크인
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Link
        href={createHref}
        className="fixed bottom-[84px] right-[max(16px,calc((100vw-430px)/2+16px))] z-30 inline-flex h-10 items-center gap-1 rounded-xl bg-[#9c6cf2] px-4 text-[14px] text-white shadow-sm"
      >
        <Plus className="size-4" /> 파티 만들기
      </Link>
      <BusinessBottomNav />
    </div>
  );
}
