"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, RefreshCw, UserRound } from "lucide-react";
import {
  listOperatorPartyPage,
  partyQueryKeys,
  type AdminParty,
  type OperatorPartyLifecycle,
} from "@/auth/api/admin-party.api";
import { Button } from "@/components/ui/button";
import { DopaMediaImage } from "@/components/ui/dopa-media-image";
import {
  BusinessBottomNav,
  BusinessLogoHeader,
} from "@/components/business-mobile/BusinessMobileNavigation";
import { formatPartyDate } from "@/lib/format-date";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { cn } from "@/lib/utils";
import { useCursorAppendFocus } from "@/hooks/use-cursor-append-focus";

export type BusinessPartyListPanelProps = {
  businessId: string;
  partyHref: (partyId: string) => string;
  createHref: string;
};

/** BUSINESS_ADMIN-only cursor list, loaded after the authenticated role is known. */
export function BusinessPartyListPanel({
  businessId,
  partyHref,
  createHref,
}: BusinessPartyListPanelProps) {
  const [tab, setTab] = useState<PartyTab>("ALL");
  const [pageIndexByScope, setPageIndexByScope] = useState<
    Record<string, number>
  >({});
  const lifecycle = operatorLifecycleForTab(tab);
  const operatorParties = useInfiniteQuery({
    queryKey: [
      ...partyQueryKeys.list(businessId, "business"),
      "operator",
      lifecycle,
    ],
    queryFn: ({ pageParam }) =>
      listOperatorPartyPage(businessId, {
        lifecycle,
        limit: OPERATOR_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: businessId.length > 0,
    staleTime: 15_000,
  });

  const operatorPages = useMemo(
    () =>
      (operatorParties.data?.pages ?? []).map((page, pageIndex) => ({
        pageIndex,
        rows: partyRowsForTab(page.items, tab),
      })),
    [operatorParties.data?.pages, tab],
  );
  const matchingOperatorPages = useMemo(
    () => operatorPages.filter((page) => page.rows.length > 0),
    [operatorPages],
  );
  const pageScopeKey = `${businessId}:${tab}`;
  const requestedPageIndex = pageIndexByScope[pageScopeKey];
  const currentOperatorPage =
    matchingOperatorPages.find(
      (page) => page.pageIndex === requestedPageIndex,
    ) ?? matchingOperatorPages[0];
  const currentOperatorPageIndex = currentOperatorPage?.pageIndex ?? 0;
  const currentOperatorPagePosition = matchingOperatorPages.findIndex(
    (page) => page.pageIndex === currentOperatorPageIndex,
  );
  const previousOperatorPage =
    currentOperatorPagePosition > 0
      ? matchingOperatorPages[currentOperatorPagePosition - 1]
      : undefined;
  const nextOperatorPage =
    currentOperatorPagePosition >= 0
      ? matchingOperatorPages[currentOperatorPagePosition + 1]
      : matchingOperatorPages[0];
  const operatorVisibleRows = currentOperatorPage?.rows ?? [];
  const loadedVisibleRowCount = matchingOperatorPages.reduce(
    (count, page) => count + page.rows.length,
    0,
  );
  const hasLoadedOperatorRows = (operatorParties.data?.pages ?? []).some(
    (page) => page.items.length > 0,
  );
  const fetchNextOperatorPage = operatorParties.fetchNextPage;
  const loadedOperatorPageCount = operatorParties.data?.pages.length ?? 0;

  const showOperatorPage = (pageIndex: number) => {
    setPageIndexByScope((current) =>
      current[pageScopeKey] === pageIndex
        ? current
        : { ...current, [pageScopeKey]: pageIndex },
    );
  };

  const showNextOperatorPage = async () => {
    if (nextOperatorPage) {
      showOperatorPage(nextOperatorPage.pageIndex);
      return;
    }
    if (!operatorParties.hasNextPage) return;

    try {
      const result = await fetchNextOperatorPage();
      if (!result.data || result.isError) return;

      const nextMatchingPageIndex = result.data.pages.findIndex(
        (page, pageIndex) =>
          pageIndex > currentOperatorPageIndex &&
          partyRowsForTab(page.items, tab).length > 0,
      );
      if (nextMatchingPageIndex >= 0) {
        showOperatorPage(nextMatchingPageIndex);
      }
    } catch {
      // React Query exposes the inline retry state; keep the current page intact.
    }
  };

  useEffect(() => {
    const needsDetailedOpenScan = lifecycle === "OPEN";
    if (
      needsDetailedOpenScan &&
      !operatorParties.isLoading &&
      !operatorParties.isError &&
      loadedVisibleRowCount === 0 &&
      loadedOperatorPageCount < AUTO_OPEN_SCAN_PAGE_LIMIT &&
      operatorParties.hasNextPage &&
      !operatorParties.isFetchingNextPage
    ) {
      void fetchNextOperatorPage();
    }
  }, [
    fetchNextOperatorPage,
    lifecycle,
    loadedOperatorPageCount,
    operatorParties.hasNextPage,
    operatorParties.isError,
    operatorParties.isFetchingNextPage,
    operatorParties.isLoading,
    loadedVisibleRowCount,
  ]);

  const isDetailedSearchPaused =
    lifecycle === "OPEN" &&
    loadedVisibleRowCount === 0 &&
    loadedOperatorPageCount >= AUTO_OPEN_SCAN_PAGE_LIMIT &&
    Boolean(operatorParties.hasNextPage) &&
    !operatorParties.isFetchingNextPage;

  return (
    <BusinessPartyList
      rows={operatorVisibleRows}
      tab={tab}
      onTabChange={setTab}
      isLoading={operatorParties.isLoading}
      isError={operatorParties.isError && !hasLoadedOperatorRows}
      error={operatorParties.error}
      partyHref={partyHref}
      createHref={createHref}
      isFetching={operatorParties.isFetching}
      hasPreviousPage={Boolean(previousOperatorPage)}
      hasNextPage={
        Boolean(nextOperatorPage) || Boolean(operatorParties.hasNextPage)
      }
      hasLoadedNextPage={Boolean(nextOperatorPage)}
      isFetchingNextPage={operatorParties.isFetchingNextPage}
      isNextPageError={operatorParties.isFetchNextPageError}
      isDetailedSearchPaused={isDetailedSearchPaused}
      scopeKey={pageScopeKey}
      viewKey={`${pageScopeKey}:${currentOperatorPageIndex}`}
      onRetry={() => void operatorParties.refetch()}
      onPreviousPage={() => {
        if (previousOperatorPage) {
          showOperatorPage(previousOperatorPage.pageIndex);
        }
      }}
      onLoadMore={showNextOperatorPage}
    />
  );
}

type PartyTab = "ALL" | "WAITING" | "RECRUITING" | "IN_PROGRESS" | "ENDED";

const OPERATOR_PAGE_SIZE = 50;
const AUTO_OPEN_SCAN_PAGE_LIMIT = 3;

const partyTabs: Array<{ id: PartyTab; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "WAITING", label: "대기" },
  { id: "RECRUITING", label: "모집중" },
  { id: "IN_PROGRESS", label: "진행중" },
  { id: "ENDED", label: "종료" },
];

function operatorLifecycleForTab(tab: PartyTab): OperatorPartyLifecycle {
  switch (tab) {
    case "ALL":
      return "ALL";
    case "WAITING":
      return "PENDING";
    case "RECRUITING":
    case "IN_PROGRESS":
      return "OPEN";
    case "ENDED":
      return "CLOSED";
    default: {
      const unexpectedTab: never = tab;
      return unexpectedTab;
    }
  }
}

function partyRowsForTab(rows: AdminParty[], tab: PartyTab): AdminParty[] {
  const uniqueRows = [...new Map(rows.map((party) => [party.id, party])).values()];
  return tab === "ALL"
    ? uniqueRows
    : uniqueRows.filter(
        (party) => partyTabFor(party.operationalStatus) === tab,
      );
}

export function partyTabFor(status: AdminParty["operationalStatus"]): PartyTab {
  switch (status) {
    case "DRAFT":
      return "WAITING";
    case "RECRUITING":
    case "CONFIRMED":
      return "RECRUITING";
    case "CHECKIN_OPEN":
    case "LIVE":
    case "INTEREST_OPEN":
    case "INTEREST_CLOSED":
    case "MATCH_PENDING":
    case "MATCH_REVEALED":
    case "AFTER_PARTY":
      return "IN_PROGRESS";
    case "COMPLETED":
    case "CANCELLED":
      return "ENDED";
    default: {
      const unexpectedStatus: never = status;
      return unexpectedStatus;
    }
  }
}

function partyBadge(status: AdminParty["operationalStatus"]): {
  label: string;
  className: string;
} {
  const tab = partyTabFor(status);
  if (tab === "RECRUITING") {
    return { label: "모집중", className: "bg-secondary text-secondary-foreground" };
  }
  if (tab === "WAITING") {
    return { label: "대기", className: "bg-muted text-muted-foreground" };
  }
  if (tab === "IN_PROGRESS") {
    return { label: "진행중", className: "bg-info/10 text-foreground" };
  }
  return {
    label: status === "CANCELLED" ? "취소" : "종료",
    className: "bg-muted text-muted-foreground",
  };
}

function BusinessPartyList({
  rows,
  tab,
  onTabChange,
  isLoading,
  isError,
  error,
  partyHref,
  createHref,
  isFetching,
  hasPreviousPage,
  hasNextPage,
  hasLoadedNextPage,
  isFetchingNextPage,
  isNextPageError,
  isDetailedSearchPaused,
  scopeKey,
  viewKey,
  onRetry,
  onPreviousPage,
  onLoadMore,
}: {
  rows: AdminParty[];
  tab: PartyTab;
  onTabChange: (tab: PartyTab) => void;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  partyHref: (partyId: string) => string;
  createHref: string;
  isFetching: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  hasLoadedNextPage: boolean;
  isFetchingNextPage: boolean;
  isNextPageError: boolean;
  isDetailedSearchPaused: boolean;
  scopeKey: string;
  viewKey: string;
  onRetry: () => void;
  onPreviousPage: () => void;
  onLoadMore: () => void | Promise<void>;
}) {
  const { admin } = useAdminAuth();
  const visible = rows;
  const businessName = admin?.business?.name ?? admin?.name ?? "업체";
  const {
    beginAppend,
    setFallbackRef,
    setItemRef,
    setRetryButtonRef,
  } = useCursorAppendFocus<HTMLAnchorElement>({
    scopeKey,
    itemKeys: visible.map((party) => party.id),
    isFetchingNextPage,
    isFetchNextPageError: isNextPageError,
    hasNextPage,
    focusMode: "page",
    viewKey,
  });
  const loadMore = () => {
    beginAppend();
    void onLoadMore();
  };
  const showPreviousPage = () => {
    beginAppend();
    onPreviousPage();
  };

  return (
    <div className="min-h-dvh bg-background pb-28 font-pretendard md:pb-10">
      <BusinessLogoHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
        <section className="flex items-center gap-3 pt-2">
          <div className="grid size-13 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground">
            <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">업체 운영 홈</p>
            <h1 className="text-balance text-lg font-bold leading-tight sm:text-xl">
              {businessName} 관리자님, 안녕하세요
            </h1>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="party-list-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="party-list-title" className="text-lg font-bold leading-normal">내 파티 목록</h2>
              <p className="mt-1 text-sm text-muted-foreground">신청자 검토와 체크인을 한곳에서 관리하세요.</p>
            </div>
            <span
              className="shrink-0 text-sm tabular-nums text-muted-foreground"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {isLoading
                ? "파티 목록 불러오는 중"
                : isError
                  ? ""
                  : isFetchingNextPage
                    ? "파티 목록 더 불러오는 중"
                    : `현재 페이지 ${visible.length}개`}
            </span>
          </div>
          <div className="mt-4 flex min-h-11 gap-1 overflow-x-auto border-b" role="group" aria-label="파티 상태 필터">
            {partyTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={tab === item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "min-h-11 shrink-0 border-b-2 px-3 text-sm leading-normal outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring",
                  tab === item.id
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section id="party-list-panel" className="min-h-[360px] pt-4">
          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="파티 목록을 불러오는 중" aria-busy="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-48 animate-pulse rounded-2xl border bg-muted/60" />
              ))}
            </div>
          )}
          {isError && (
            <div className="grid min-h-[320px] place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
              <div>
                <p className="font-medium text-destructive">파티 목록을 불러오지 못했습니다.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error?.message ?? "잠시 후 다시 시도해 주세요."}
                </p>
                <Button type="button" variant="outline" className="mt-4 min-h-11" disabled={isFetching} onClick={onRetry}>
                  <RefreshCw className={isFetching ? "animate-spin" : undefined} />
                  다시 시도
                </Button>
              </div>
            </div>
          )}
          {!isLoading &&
            !isError &&
            visible.length === 0 &&
            isFetchingNextPage && (
              <div
                className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed bg-muted/20 px-4 text-center"
                role="status"
              >
                <div>
                  <RefreshCw className="mx-auto size-5 animate-spin text-primary" />
                  <p className="mt-3 font-medium">해당 상태의 파티를 더 찾는 중이에요.</p>
                </div>
              </div>
            )}
          {!isLoading &&
            !isError &&
            visible.length === 0 &&
            isDetailedSearchPaused && (
              <div
                className="grid min-h-[320px] place-items-center rounded-2xl border border-dashed bg-muted/20 px-5 text-center"
                role="status"
              >
                <div>
                  <p className="font-medium">
                    먼저 불러온 최대 {OPERATOR_PAGE_SIZE * AUTO_OPEN_SCAN_PAGE_LIMIT}건에서 {partyTabLabel(tab)} 파티를 찾지 못했습니다.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    전체 운영 목록을 한 번에 내려받지 않고 다음 50건씩 계속 확인할 수 있습니다.
                  </p>
                </div>
              </div>
            )}
          {!isLoading &&
            !isError &&
            visible.length === 0 &&
            !isFetchingNextPage &&
            !isDetailedSearchPaused &&
            !hasNextPage && (
            <div
              ref={setFallbackRef}
              tabIndex={-1}
              className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed bg-muted/20 px-4 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <div>
                <p className="font-medium">아직 등록한 파티가 없어요.</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">새로운 파티를 Dopa에서 등록해보세요.</p>
              </div>
            </div>
          )}
          {!isLoading && !isError && visible.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="파티 목록">
              {visible.map((party) => {
                const badge = partyBadge(party.operationalStatus);
                const pending = party.pendingApplicationCount;
                return (
                  <li key={party.id} className="min-w-0">
                    <article className="h-full overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
                      <Link
                        ref={(node) => setItemRef(party.id, node)}
                        href={partyHref(party.id)}
                        className="group block p-4 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", badge.className)}>
                            {badge.label}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </div>
                        <div className="mt-3 flex gap-3">
                          <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                            {party.coverImage ? (
                              <DopaMediaImage
                                src={party.coverImage}
                                transformWidth={320}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <div className="grid size-full place-items-center text-xs text-muted-foreground">이미지 없음</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-bold leading-normal">{party.title}</h3>
                            <p className="mt-1 truncate text-sm leading-normal text-muted-foreground">
                              {party.location} · {formatPartyDate(party.startsAt ?? party.date)}
                            </p>
                            <p className="mt-1 text-sm leading-normal text-muted-foreground">
                              정원 {party.maxCapacity} · 대기 {pending ?? "-"} · 확정 {party.currentCount}
                            </p>
                          </div>
                        </div>
                      </Link>
                      <div className="grid grid-cols-2 border-t text-sm text-muted-foreground">
                        <Link
                          href={`/app/parties/${encodeURIComponent(party.id)}/applications`}
                          className="grid min-h-11 place-items-center border-r outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          신청자 현황
                        </Link>
                        <Link
                          href={`/app/parties/${encodeURIComponent(party.id)}/check-in`}
                          className="grid min-h-11 place-items-center outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          QR 체크인
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          {!isLoading && !isError && isNextPageError && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <p className="text-sm text-destructive">
                다음 파티를 불러오지 못했습니다. 이미 불러온 파티는 그대로
                유지했습니다.
              </p>
              <Button
                ref={setRetryButtonRef}
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isFetchingNextPage}
                onClick={loadMore}
              >
                <RefreshCw
                  className={isFetchingNextPage ? "animate-spin" : undefined}
                />
                {isFetchingNextPage ? "다시 불러오는 중…" : "다음 페이지 다시 시도"}
              </Button>
            </div>
          )}
          {!isLoading &&
            !isError &&
            (hasPreviousPage || (!isNextPageError && hasNextPage)) && (
            <nav
              aria-label="파티 페이지 탐색"
              className="mt-4 flex flex-wrap justify-center gap-3"
            >
              {hasPreviousPage && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 min-w-32"
                  disabled={isFetchingNextPage}
                  onClick={showPreviousPage}
                >
                  이전 파티
                </Button>
              )}
              {!isNextPageError && hasNextPage && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 min-w-32"
                disabled={isFetchingNextPage}
                onClick={loadMore}
              >
                {isFetchingNextPage
                  ? "불러오는 중…"
                  : isDetailedSearchPaused
                    ? "다음 50건에서 계속 찾기"
                    : hasLoadedNextPage
                      ? "다음 파티"
                      : "파티 더 보기"}
              </Button>
              )}
            </nav>
          )}
        </section>
      </main>

      <Link
        href={createHref}
        className="fixed bottom-[84px] right-4 z-30 inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring sm:right-6 md:bottom-6 lg:right-8"
      >
        <Plus className="size-4" /> 파티 만들기
      </Link>
      <BusinessBottomNav />
    </div>
  );
}

function partyTabLabel(tab: PartyTab): string {
  return partyTabs.find((item) => item.id === tab)?.label ?? "선택한 상태";
}
