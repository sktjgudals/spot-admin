"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { SUPER_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import {
  businessQueryKeys,
  listBusinessesPage,
  type AdminBusiness,
  type BusinessStatus,
} from "@/auth/api/admin-business.api";
import {
  businessDetailPath,
} from "@/auth/model/admin-routes";
import { BusinessStatusBadge } from "./_components/BusinessStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BUSINESS_AS_OF_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * SUPER_ADMIN 업체 목록.
 */
export default function AppBusinessesPage() {
  return (
    <RoleGuard allow={SUPER_ADMIN_ONLY}>
      <Suspense
        fallback={
          <div
            className="h-32 animate-pulse rounded-xl border bg-muted/40"
            role="status"
            aria-label="업체 목록 필터를 준비하는 중"
          />
        }
      >
        <BusinessList />
      </Suspense>
    </RoleGuard>
  );
}

function BusinessList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q")?.trim() ?? "";
  const urlStatus = parseBusinessStatus(searchParams.get("status"));
  const urlStateKey = searchParams.toString();
  const [filters, setFilters] = useState(() => ({
    urlStateKey,
    draftQuery: urlQuery,
    query: urlQuery,
    status: urlStatus,
    pageIndex: 0,
  }));
  if (filters.urlStateKey !== urlStateKey) {
    setFilters({
      urlStateKey,
      draftQuery: urlQuery,
      query: urlQuery,
      status: urlStatus,
      pageIndex: 0,
    });
  }
  const { draftQuery, query, status, pageIndex } = filters;
  const replaceFilters = (
    nextQuery: string,
    nextStatus: BusinessStatus | "",
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQuery) params.set("q", nextQuery);
    else params.delete("q");
    if (nextStatus) params.set("status", nextStatus);
    else params.delete("status");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  const listParams = {
    status: status || undefined,
    q: query || undefined,
    limit: 25,
  };
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: businessQueryKeys.list(listParams),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listBusinessesPage({
        ...listParams,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const pages = data?.pages ?? [];
  const currentPageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[currentPageIndex];
  const rows: AdminBusiness[] = currentPage?.items ?? [];
  const hasLoadedPage = pages.length > 0;
  const asOf = currentPage?.asOf ?? null;
  const hasLoadedNextPage = currentPageIndex + 1 < pages.length;
  const canLoadNextPage =
    currentPageIndex === pages.length - 1 && Boolean(hasNextPage);
  const canGoNext = hasLoadedNextPage || canLoadNextPage;
  const nextPageErrorVisible =
    isFetchNextPageError && currentPageIndex === pages.length - 1;
  const firstRowRef = useRef<HTMLTableRowElement | null>(null);
  const emptyRowRef = useRef<HTMLTableRowElement | null>(null);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusPageIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const targetPageIndex = focusPageIndexRef.current;
    if (targetPageIndex === null || isFetchingNextPage) return;

    if (nextPageErrorVisible && targetPageIndex >= pages.length) {
      retryButtonRef.current?.focus();
      focusPageIndexRef.current = null;
      return;
    }
    if (targetPageIndex !== currentPageIndex) return;

    (firstRowRef.current ?? emptyRowRef.current)?.focus();
    focusPageIndexRef.current = null;
  }, [currentPageIndex, isFetchingNextPage, nextPageErrorVisible, pages.length]);

  const showPage = (nextPageIndex: number) => {
    focusPageIndexRef.current = nextPageIndex;
    setFilters((current) => ({ ...current, pageIndex: nextPageIndex }));
  };
  const loadNextPage = async () => {
    const nextPageIndex = currentPageIndex + 1;
    focusPageIndexRef.current = nextPageIndex;
    if (nextPageIndex < pages.length) {
      setFilters((current) => ({ ...current, pageIndex: nextPageIndex }));
      return;
    }

    const result = await fetchNextPage();
    if (result.data?.pages[nextPageIndex]) {
      setFilters((current) => ({ ...current, pageIndex: nextPageIndex }));
      return;
    }
    if (!result.isError) {
      focusPageIndexRef.current = null;
      nextButtonRef.current?.focus();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">업체 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            업체 계정의 운영 상태와 수수료 정책을 조회하고 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden />
            새로고침
          </Button>
          <Button nativeButton={false} render={<Link href="/app/businesses/new" />}>
            <Plus aria-hidden />
            업체 등록
          </Button>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-3 sm:p-4" aria-label="업체 목록 필터">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            role="search"
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const nextQuery = draftQuery.trim();
              setFilters((current) => ({
                ...current,
                draftQuery: nextQuery,
                query: nextQuery,
                pageIndex: 0,
              }));
              replaceFilters(nextQuery, status);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={draftQuery}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    draftQuery: event.target.value,
                  }))
                }
                aria-label="업체 검색"
                placeholder="업체명 또는 연락처 검색"
                className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" variant="outline" className="min-h-11">검색</Button>
          </form>
          <label className="flex items-center gap-2 text-sm font-medium">
            <span className="shrink-0">상태</span>
            <select
              aria-label="업체 상태"
              value={status}
              onChange={(event) => {
                const nextStatus = parseBusinessStatus(event.target.value);
                setFilters((current) => ({
                  ...current,
                  status: nextStatus,
                  pageIndex: 0,
                }));
                replaceFilters(query, nextStatus);
              }}
              className="h-11 min-w-36 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <option value="">전체 상태</option>
              <option value="PENDING">검토 대기</option>
              <option value="ACTIVE">활성</option>
              <option value="SUSPENDED">정지</option>
              <option value="DISABLED">비활성</option>
            </select>
          </label>
        </div>
        {query ? (
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <p className="min-w-0 truncate text-muted-foreground">검색어: <strong className="text-foreground">{query}</strong></p>
            <button
              type="button"
              className="min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
              onClick={() => {
                setFilters((current) => ({
                  ...current,
                  draftQuery: "",
                  query: "",
                  pageIndex: 0,
                }));
                replaceFilters("", status);
              }}
            >
              검색 초기화
            </button>
          </div>
        ) : null}
      </section>

      {isLoading && (
        <div className="space-y-2" aria-label="업체를 불러오는 중" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      )}
      {isError && !hasLoadedPage && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {(error as Error)?.message ?? "목록을 불러오지 못했습니다"}
          <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      )}

      {!isLoading && (hasLoadedPage || !isError) && (
        <section aria-labelledby="business-result-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="business-result-title" className="text-sm font-semibold">검색 결과</h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {currentPageIndex + 1}페이지 · {rows.length}건 표시
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-background" role="region" aria-label="업체 목록" tabIndex={0}>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>업체명</TableHead>
                <TableHead>종류</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead className="text-center">수수료</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-28"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow
                  ref={emptyRowRef}
                  tabIndex={-1}
                  className="outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    이 페이지에 표시할 업체가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b, index) => (
                <TableRow
                  key={b.id}
                  ref={index === 0 ? firstRowRef : undefined}
                  tabIndex={-1}
                  className="outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <TableCell>
                    <Link
                      href={businessDetailPath(b.id)}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                    {b.tagline && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {b.tagline}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.kind === "COMPANY" ? "법인" : "개인"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.contactEmail ?? b.contactPhone ?? "미입력"}
                  </TableCell>
                  <TableCell className="text-center text-sm whitespace-nowrap">
                    {(b.feeRateBps / 100).toFixed(
                      b.feeRateBps % 100 === 0 ? 0 : 1,
                    )}
                    %
                  </TableCell>
                  <TableCell>
                    <BusinessStatusBadge
                      status={b.status}
                      deletedAt={b.deletedAt}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      nativeButton={false}
                      size="sm"
                      variant="ghost"
                      render={<Link href={businessDetailPath(b.id)} />}
                    >
                      상세
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {nextPageErrorVisible ? (
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>다음 업체 목록을 불러오지 못했습니다. 현재 목록은 유지됩니다.</span>
              <Button
                ref={retryButtonRef}
                type="button"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={loadNextPage}
              >
                다시 시도
              </Button>
            </div>
          ) : null}
          {!nextPageErrorVisible ? (
            <nav
              className="mt-4 flex items-center justify-center gap-2"
              aria-label="업체 목록 페이지"
            >
              <Button
                type="button"
                variant="outline"
                className="min-h-11 min-w-32"
                disabled={currentPageIndex === 0 || isFetchingNextPage}
                onClick={() => showPage(currentPageIndex - 1)}
              >
                <ChevronLeft aria-hidden />
                이전 페이지
              </Button>
              <span
                className="min-w-16 text-center text-xs font-medium tabular-nums text-muted-foreground"
                aria-live="polite"
                aria-atomic="true"
              >
                {currentPageIndex + 1}페이지
              </span>
              <Button
                ref={nextButtonRef}
                type="button"
                variant="outline"
                className="min-h-11 min-w-32"
                disabled={!canGoNext || isFetchingNextPage}
                onClick={() => void loadNextPage()}
              >
                {isFetchingNextPage ? "불러오는 중…" : "다음 페이지"}
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          ) : null}
          {!canGoNext && rows.length > 0 ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">모든 업체를 표시했습니다.</p>
          ) : null}
          {asOf ? (
            <p className="mt-2 text-right text-xs text-muted-foreground">
              데이터 기준 <time dateTime={asOf}>{BUSINESS_AS_OF_FORMATTER.format(new Date(asOf))}</time>
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function parseBusinessStatus(value: string | null): BusinessStatus | "" {
  return value === "PENDING" ||
    value === "ACTIVE" ||
    value === "SUSPENDED" ||
    value === "DISABLED"
    ? value
    : "";
}
