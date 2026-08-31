"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Building2, LoaderCircle, RefreshCw, UserRoundCog } from "lucide-react";
import {
  businessQueryKeys,
  listBusinessesPage,
  type BusinessAdminAssignment,
} from "@/auth/api/admin-business.api";
import { businessDetailPath } from "@/auth/model/admin-routes";
import { BusinessAdminPicker } from "@/components/admin/BusinessAdminPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function BusinessAdminAssignmentConsole() {
  const [businessId, setBusinessId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [lastAssignment, setLastAssignment] =
    useState<BusinessAdminAssignment | null>(null);
  const businessSelectRef = useRef<HTMLSelectElement>(null);
  const pageFocusFallbackRef = useRef<HTMLParagraphElement>(null);
  const nextPageRetryRef = useRef<HTMLButtonElement>(null);
  const pendingCursorFocusRef = useRef<{ targetPageIndex: number } | null>(null);
  const businesses = useInfiniteQuery({
    queryKey: businessQueryKeys.list({ status: "ACTIVE", limit: 100 }),
    queryFn: ({ pageParam }) =>
      listBusinessesPage({
        status: "ACTIVE",
        limit: 100,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const pages = businesses.data?.pages ?? [];
  const currentPageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const businessItems = useMemo(
    () => businesses.data?.pages[currentPageIndex]?.items ?? [],
    [businesses.data, currentPageIndex],
  );
  const selectedBusiness = useMemo(
    () =>
      businesses.data?.pages
        .flatMap((page) => page.items)
        .find((business) => business.id === businessId),
    [businessId, businesses.data],
  );
  const visibleBusinessOptions = useMemo(
    () =>
      selectedBusiness &&
      !businessItems.some((business) => business.id === selectedBusiness.id)
        ? [selectedBusiness, ...businessItems]
        : businessItems,
    [businessItems, selectedBusiness],
  );
  const hasLoadedNextPage = currentPageIndex < pages.length - 1;
  const hasNextPage = hasLoadedNextPage || Boolean(businesses.hasNextPage);
  const visibleAssignment =
    lastAssignment &&
    selectedBusiness &&
    lastAssignment.businessId === selectedBusiness.id
      ? lastAssignment
      : null;

  const selectBusiness = (nextBusinessId: string) => {
    setBusinessId(nextBusinessId);
    setLastAssignment(null);
  };

  useEffect(() => {
    const pending = pendingCursorFocusRef.current;
    if (!pending) return;
    if (businesses.isFetchNextPageError) {
      nextPageRetryRef.current?.focus();
      return;
    }
    if (
      !businesses.isFetchingNextPage &&
      currentPageIndex === pending.targetPageIndex
    ) {
      (businessSelectRef.current ?? pageFocusFallbackRef.current)?.focus();
      pendingCursorFocusRef.current = null;
    }
  }, [
    currentPageIndex,
    businesses.isFetchNextPageError,
    businesses.isFetchingNextPage,
  ]);

  const loadNextBusinessPage = async () => {
    const targetPageIndex = currentPageIndex + 1;
    pendingCursorFocusRef.current = { targetPageIndex };
    if (hasLoadedNextPage) {
      setPageIndex(targetPageIndex);
      return;
    }
    const previousPageCount = pages.length;
    const result = await businesses.fetchNextPage();
    if (result.data && result.data.pages.length > previousPageCount) {
      setPageIndex(previousPageCount);
    }
  };
  const loadPreviousBusinessPage = () => {
    const targetPageIndex = Math.max(0, currentPageIndex - 1);
    pendingCursorFocusRef.current = { targetPageIndex };
    setPageIndex(targetPageIndex);
  };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">업체 관리자 배정</h1>
        <p className="text-sm text-muted-foreground">
          가입된 사용자를 이름이나 이메일로 찾아 선택한 업체에 직접 매핑합니다.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Building2 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>1. 업체 선택</CardTitle>
                <CardDescription>
                  관리자를 배정할 활성 업체를 먼저 선택하세요.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {businesses.isPending && (
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            )}

            {businesses.isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">
                  업체 목록을 불러오지 못했습니다.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {businesses.error instanceof Error
                    ? businesses.error.message
                    : "잠시 후 다시 시도해 주세요."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => void businesses.refetch()}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  다시 시도
                </Button>
              </div>
            )}

            {businesses.data && businessItems.length === 0 && (
              <p
                ref={pageFocusFallbackRef}
                tabIndex={-1}
                className="rounded-md border border-dashed p-4 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                관리자를 배정할 활성 업체가 없습니다.
              </p>
            )}

            {visibleBusinessOptions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="business-admin-business">업체</Label>
                <select
                  ref={businessSelectRef}
                  id="business-admin-business"
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={businessId}
                  onChange={(event) => selectBusiness(event.target.value)}
                >
                  <option value="">업체를 선택하세요</option>
                  {visibleBusinessOptions.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  이 페이지의 활성 업체 {businessItems.length}개를 불러왔습니다.
                </p>
              </div>
            )}

            {businesses.isFetchNextPageError && businessItems.length > 0 && (
              <div
                className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
                role="alert"
              >
                <p className="text-sm text-destructive">
                  다음 활성 업체 목록을 불러오지 못했습니다.
                </p>
                <Button
                  ref={nextPageRetryRef}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadNextBusinessPage()}
                >
                  다음 업체 다시 시도
                </Button>
              </div>
            )}

            {businesses.data && !businesses.isFetchNextPageError &&
            (currentPageIndex > 0 || hasNextPage) ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPageIndex === 0}
                  onClick={loadPreviousBusinessPage}
                >
                  이전 활성 업체
                </Button>
                <span className="px-2 text-xs text-muted-foreground" aria-live="polite">
                  {currentPageIndex + 1}페이지
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={businesses.isFetchingNextPage || !hasNextPage}
                  onClick={() => void loadNextBusinessPage()}
                >
                  {businesses.isFetchingNextPage && (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  )}
                  활성 업체 더 보기
                </Button>
              </div>
            ) : null}

            {selectedBusiness && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{selectedBusiness.name}</p>
                  <Badge variant="outline">{selectedBusiness.kind}</Badge>
                  <Badge>{selectedBusiness.status}</Badge>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  업체 ID: {selectedBusiness.id}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={businessDetailPath(selectedBusiness.id)} />
                  }
                >
                  업체 상세 보기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <UserRoundCog className="size-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>2. 등록 사용자 조회 및 배정</CardTitle>
                <CardDescription>
                  {selectedBusiness
                    ? `${selectedBusiness.name}에 배정할 사용자를 검색하세요.`
                    : "업체를 선택하면 사용자 검색이 활성화됩니다."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedBusiness && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                왼쪽에서 업체를 먼저 선택하세요.
              </p>
            )}

            {selectedBusiness && (
              <>
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                  검색한 사용자는 <strong>{selectedBusiness.name}</strong>에
                  업체 관리자로 배정됩니다.
                </div>
                <BusinessAdminPicker
                  key={selectedBusiness.id}
                  businessId={selectedBusiness.id}
                  businessName={selectedBusiness.name}
                  confirmAssignment
                  onAssigned={setLastAssignment}
                />
              </>
            )}

            {visibleAssignment && (
              <div
                role="status"
                className="rounded-md border border-success/30 bg-success/10 p-4 text-sm"
              >
                <p className="font-medium text-foreground">
                  {visibleAssignment.nickname}님을 {visibleAssignment.businessName}{" "}
                  업체 관리자로 배정했습니다.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {visibleAssignment.email ?? "이메일 없음"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
