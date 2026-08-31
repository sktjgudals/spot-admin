"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, RefreshCw, Star } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  listOperatorPartyPage,
  partyQueryKeys,
  type AdminParty,
} from "@/auth/api/admin-party.api";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileNavigation";
import { Button } from "@/components/ui/button";
import { useCursorAppendFocus } from "@/hooks/use-cursor-append-focus";

const REVIEW_PAGE_SIZE = 50;
const REVIEW_WINDOW_SIZE = 40;

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
  const [pageState, setPageState] = useState({ businessId: "", index: 0 });
  const [visibleWindow, setVisibleWindow] = useState({
    viewKey: "",
    count: REVIEW_WINDOW_SIZE,
  });
  const reviews = useInfiniteQuery({
    queryKey: [
      ...partyQueryKeys.list(businessId, "business"),
      "operator",
      "CLOSED",
    ],
    queryFn: ({ pageParam }) =>
      listOperatorPartyPage(businessId, {
        lifecycle: "CLOSED",
        limit: REVIEW_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: businessId.length > 0,
    staleTime: 15_000,
  });
  const pages = reviews.data?.pages ?? [];
  const requestedPageIndex =
    pageState.businessId === businessId ? pageState.index : 0;
  const currentPageIndex = Math.min(
    requestedPageIndex,
    Math.max(0, pages.length - 1),
  );
  const reviewableParties = useMemo(() => {
    const byId = new Map<string, AdminParty>();
    const currentPage = reviews.data?.pages[currentPageIndex];
    for (const party of currentPage?.items ?? []) {
      if (
        party.operationalStatus === "COMPLETED" &&
        party.canBusinessReview
      ) {
        byId.set(party.id, party);
      }
    }
    return [...byId.values()];
  }, [currentPageIndex, reviews.data?.pages]);
  const viewKey = `${businessId}\u0000${currentPageIndex}`;
  const visibleCount =
    visibleWindow.viewKey === viewKey
      ? visibleWindow.count
      : REVIEW_WINDOW_SIZE;
  const visibleParties = reviewableParties.slice(0, visibleCount);
  const hasHiddenLoadedParties = reviewableParties.length > visibleCount;
  const hasLoadedNextPage = currentPageIndex < pages.length - 1;
  const hasNextPage = hasLoadedNextPage || Boolean(reviews.hasNextPage);
  const canLoadMore = hasHiddenLoadedParties || hasNextPage;
  const isInitialError = reviews.isError && reviews.data === undefined;
  const {
    beginAppend: beginWindowFocus,
    setFallbackRef: setWindowFallbackRef,
    setItemRef: setWindowItemRef,
  } = useCursorAppendFocus<HTMLAnchorElement>({
    scopeKey: viewKey,
    itemKeys: visibleParties.map((party) => party.id),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: canLoadMore,
  });
  const {
    beginAppend: beginPageFocus,
    setFallbackRef: setPageFallbackRef,
    setItemRef: setPageItemRef,
    setRetryButtonRef,
  } = useCursorAppendFocus<HTMLAnchorElement>({
    scopeKey: businessId,
    viewKey: String(currentPageIndex),
    itemKeys: visibleParties.map((party) => party.id),
    isFetchingNextPage: reviews.isFetchingNextPage,
    isFetchNextPageError: reviews.isFetchNextPageError,
    hasNextPage,
    focusMode: "page",
  });

  function loadMore() {
    beginWindowFocus();
    setVisibleWindow((current) => ({
      viewKey,
      count:
        current.viewKey === viewKey
          ? current.count + REVIEW_WINDOW_SIZE
          : REVIEW_WINDOW_SIZE * 2,
    }));
  }

  async function showNextPage() {
    beginPageFocus();
    if (hasLoadedNextPage) {
      setPageState({ businessId, index: currentPageIndex + 1 });
      return;
    }
    const previousPageCount = pages.length;
    const result = await reviews.fetchNextPage();
    if (result.data && result.data.pages.length > previousPageCount) {
      setPageState({ businessId, index: previousPageCount });
    }
  }

  function showPreviousPage() {
    beginPageFocus();
    setPageState({
      businessId,
      index: Math.max(0, currentPageIndex - 1),
    });
  }

  return (
    <div className="min-h-dvh bg-background pb-24 font-pretendard md:pb-8">
      <main className="mx-auto w-full max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header className="max-w-2xl">
          <p className="text-xs font-medium text-primary">파티 품질 관리</p>
          <h1 className="mt-1 text-2xl font-bold">리뷰 관리</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            리뷰 작성이 가능한 완료 파티만 표시하며, 취소된 파티는 제외합니다.
          </p>
        </header>
        {reviews.isLoading && (
          <div
            className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-label="리뷰 가능 파티를 불러오는 중"
            aria-busy="true"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl border bg-muted"
              />
            ))}
          </div>
        )}
        {isInitialError && (
          <div
            className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive"
            role="alert"
          >
            <p className="font-medium">리뷰 가능 파티를 불러오지 못했습니다.</p>
            <p className="mt-1 text-muted-foreground">{reviews.error.message}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              disabled={reviews.isFetching}
              onClick={() => void reviews.refetch()}
            >
              <RefreshCw
                className={reviews.isFetching ? "animate-spin" : undefined}
              />
              다시 시도
            </Button>
          </div>
        )}
        {!reviews.isLoading &&
          !isInitialError &&
          reviewableParties.length === 0 &&
          !hasNextPage &&
          !reviews.isFetchNextPageError && (
            <section
              ref={(node) => {
                setWindowFallbackRef(node);
                setPageFallbackRef(node);
              }}
              tabIndex={-1}
              className="mt-6 grid min-h-[360px] place-items-center rounded-2xl border border-dashed bg-muted/20 px-5 text-center text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <div>
                <Star className="mx-auto size-8" aria-hidden />
                <p className="mt-3">아직 리뷰할 수 있는 종료 파티가 없어요.</p>
              </div>
            </section>
          )}
        {!reviews.isLoading &&
          !isInitialError &&
          reviewableParties.length === 0 &&
          hasNextPage &&
          !reviews.isFetchNextPageError && (
            <section
              className="mt-6 grid min-h-[280px] place-items-center rounded-2xl border border-dashed bg-muted/20 px-5 text-center text-sm text-muted-foreground"
              role="status"
            >
              <div>
                <Star className="mx-auto size-8" aria-hidden />
                <p className="mt-3 font-medium text-foreground">
                  현재 불러온 종료 파티에는 리뷰 가능한 파티가 없어요.
                </p>
                <p className="mt-1 leading-relaxed">
                  취소된 파티는 제외했습니다. 다음 종료 파티를 이어서 확인할 수 있어요.
                </p>
              </div>
            </section>
          )}
        {!reviews.isLoading &&
          !isInitialError &&
          reviewableParties.length > 0 && (
            <p
              className="mt-6 text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {visibleParties.length} / {reviewableParties.length}개 표시 중
              {` · ${currentPageIndex + 1}페이지`}
              {hasNextPage ? " · 다음 종료 파티 있음" : ""}
            </p>
          )}
        {!reviews.isLoading && !isInitialError && visibleParties.length > 0 && (
          <ul
            className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-label="리뷰 가능 파티"
          >
            {visibleParties.map((party) => (
              <li key={party.id}>
                <Link
                  ref={(node) => {
                    setWindowItemRef(party.id, node);
                    setPageItemRef(party.id, node);
                  }}
                  href={`/app/parties/${encodeURIComponent(party.id)}`}
                  className="flex min-h-24 items-center gap-3 rounded-2xl border bg-card p-4 text-card-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <div className="grid size-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                    <Star className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-base">
                      {party.title}
                    </strong>
                    <span className="text-sm text-muted-foreground">
                      참가자 리뷰 작성
                    </span>
                  </div>
                  <ChevronRight
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!reviews.isLoading && !isInitialError && reviews.isFetchNextPageError ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="text-sm text-destructive">
              다음 종료 파티를 불러오지 못했습니다. 이미 불러온 리뷰 가능 파티는
              그대로 유지했습니다.
            </p>
            <Button
              ref={setRetryButtonRef}
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={reviews.isFetchingNextPage}
              onClick={() => void showNextPage()}
            >
              <RefreshCw
                className={reviews.isFetchingNextPage ? "animate-spin" : undefined}
              />
              {reviews.isFetchingNextPage
                ? "다시 불러오는 중…"
                : "다음 페이지 다시 시도"}
            </Button>
          </div>
        ) : !reviews.isLoading &&
          !isInitialError &&
          hasHiddenLoadedParties ? (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 min-w-40"
              disabled={reviews.isFetchingNextPage}
              onClick={loadMore}
            >
              리뷰 파티 더 보기
            </Button>
          </div>
        ) : !reviews.isLoading &&
          !isInitialError &&
          (currentPageIndex > 0 || hasNextPage) ? (
          <nav
            className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"
            aria-label="리뷰 파티 페이지"
          >
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={currentPageIndex === 0}
              onClick={showPreviousPage}
            >
              이전 리뷰 페이지
            </Button>
            <span className="px-2 text-xs text-muted-foreground" aria-live="polite">
              {currentPageIndex + 1}페이지
            </span>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={reviews.isFetchingNextPage || !hasNextPage}
              onClick={() => void showNextPage()}
            >
              {reviews.isFetchingNextPage
                ? "불러오는 중…"
                : reviewableParties.length === 0
                  ? "다음 종료 파티 확인"
                  : "다음 리뷰 페이지"}
            </Button>
          </nav>
        ) : null}
      </main>
      <BusinessBottomNav />
    </div>
  );
}
