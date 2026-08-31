import { useSyncExternalStore } from "react";
import { AlertTriangle, FilterX, Inbox, RefreshCw } from "lucide-react";
import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { ResourceConfig } from "@/components/admin/resource-configs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatResourceText, renderResourceValue } from "./formatters";
import {
  ResourceRowActions,
  type ResourceRowActionHandlers,
} from "./ResourceRowActions";

type ResourceListProps = ResourceRowActionHandlers & {
  config: ResourceConfig;
  items: AdminResource[];
  error: Error | null;
  isError: boolean;
  isFetchNextPageError: boolean;
  isPending: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  hasFilters: boolean;
  mutationPending: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
  onFetchNextPage: () => void;
  onPreviousPage: () => void;
  setFallbackRef: (node: HTMLElement | null) => void;
  setItemRef: (key: string, node: HTMLElement | null) => void;
  setRetryButtonRef: (node: HTMLButtonElement | null) => void;
};

const DESKTOP_RESOURCE_QUERY = "(min-width: 768px)";

function subscribeDesktopLayout(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DESKTOP_RESOURCE_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function desktopLayoutSnapshot(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DESKTOP_RESOURCE_QUERY).matches;
}

function useDesktopResourceLayout(): boolean {
  return useSyncExternalStore(subscribeDesktopLayout, desktopLayoutSnapshot, () => false);
}

function ResourceSkeleton({ columns, isDesktop }: { columns: number; isDesktop: boolean }) {
  return (
    <div aria-label="데이터를 불러오는 중" role="status">
      <span className="sr-only">데이터를 불러오는 중입니다.</span>
      {isDesktop ? <div className="overflow-hidden rounded-xl border bg-card">
        <div
          className="grid h-10 items-center gap-3 border-b bg-muted/50 px-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(columns, 5)}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: Math.min(columns, 5) }, (_, index) => (
            <div key={index} className="h-3 w-16 animate-pulse rounded bg-muted-foreground/15" />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-6 border-b px-3 last:border-b-0">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div> : <div className="grid gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-7 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>}
    </div>
  );
}

function ResourceError({
  error,
  hasFilters,
  onRetry,
  onClearFilters,
}: Pick<ResourceListProps, "error" | "hasFilters" | "onRetry" | "onClearFilters">) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="font-medium text-destructive">데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {error?.message ?? "잠시 후 다시 시도해 주세요."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw /> 다시 시도
            </Button>
            {hasFilters ? (
              <Button size="sm" variant="ghost" onClick={onClearFilters}>
                <FilterX /> 필터 초기화
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceEmpty({
  hasFilters,
  onClearFilters,
  setFallbackRef,
}: Pick<ResourceListProps, "hasFilters" | "onClearFilters" | "setFallbackRef">) {
  return (
    <div
      ref={setFallbackRef}
      tabIndex={-1}
      className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      <span className="grid size-10 place-items-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground" />
      </span>
      <p className="mt-3 font-medium">{hasFilters ? "검색 결과가 없습니다." : "표시할 데이터가 없습니다."}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {hasFilters ? "검색어나 상태 조건을 바꿔 다시 확인해 주세요." : "새 데이터가 등록되면 이 목록에 표시됩니다."}
      </p>
      {hasFilters ? (
        <Button className="mt-3" size="sm" variant="outline" onClick={onClearFilters}>
          <FilterX /> 필터 초기화
        </Button>
      ) : null}
    </div>
  );
}

export function ResourceList({
  config,
  items,
  error,
  isError,
  isFetchNextPageError,
  isPending,
  isFetchingNextPage,
  hasNextPage,
  hasPreviousPage,
  hasFilters,
  mutationPending,
  onRetry,
  onClearFilters,
  onFetchNextPage,
  onPreviousPage,
  setFallbackRef,
  setItemRef,
  setRetryButtonRef,
  onDetail,
  onEdit,
  onAction,
}: ResourceListProps) {
  const isDesktop = useDesktopResourceLayout();
  if (isError && items.length === 0) {
    return (
      <ResourceError
        error={error}
        hasFilters={hasFilters}
        onRetry={onRetry}
        onClearFilters={onClearFilters}
      />
    );
  }
  if (isPending) return <ResourceSkeleton columns={config.columns.length} isDesktop={isDesktop} />;
  if (items.length === 0) {
    return (
      <ResourceEmpty
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
        setFallbackRef={setFallbackRef}
      />
    );
  }

  const firstColumns = config.columns.slice(0, 3);
  const preferredMobileColumns = ["amount", "totalAmount", "status", "createdAt"].flatMap(
    (key) => config.columns.find((column) => column.key === key) ?? [],
  );
  const mobileColumns = Array.from(
    new Map([...firstColumns, ...preferredMobileColumns].map((column) => [column.key, column])).values(),
  ).slice(0, 5);

  return (
    <div className="space-y-3">
      {isDesktop ? <div className="overflow-x-auto rounded-xl border bg-card" role="region" aria-label={`${config.title} 표`} tabIndex={0}>
        <Table className="min-w-[840px]" aria-label={`${config.title} 목록`}>
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              {config.columns.map((column) => (
                <TableHead key={column.key} className="h-9 px-3 text-xs font-semibold text-muted-foreground">
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="sticky right-0 h-9 bg-muted/95 px-3 text-right text-xs font-semibold text-muted-foreground">
                작업
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow
                key={row.id}
                ref={(node) => setItemRef(row.id, node)}
                tabIndex={-1}
                className="group outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {config.columns.map((column) => {
                  const fullText = formatResourceText(row[column.key], column.key);
                  return (
                    <TableCell key={column.key} className="h-11 max-w-72 px-3 py-1.5">
                      <div className="truncate" title={fullText === "—" ? undefined : fullText}>
                        {renderResourceValue(row[column.key], column.key)}
                      </div>
                    </TableCell>
                  );
                })}
                <TableCell className="sticky right-0 h-11 bg-card px-2 py-1.5 shadow-[-8px_0_12px_-12px_rgb(0_0_0/0.35)] group-hover:bg-muted/50">
                  <ResourceRowActions
                    config={config}
                    row={row}
                    disabled={mutationPending}
                    onDetail={onDetail}
                    onEdit={onEdit}
                    onAction={onAction}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div> : <div className="grid gap-2">
        {items.map((row) => {
          const primaryColumn = config.columns[0];
          const primaryKey = primaryColumn?.key ?? "id";
          return (
            <article
              key={row.id}
              ref={(node) => setItemRef(row.id, node)}
              tabIndex={-1}
              className="rounded-xl border bg-card p-3 shadow-sm shadow-foreground/[0.02] outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{primaryColumn?.label ?? "ID"}</p>
                  <p className="mt-0.5 truncate font-medium" title={formatResourceText(row[primaryKey], primaryKey)}>
                    {renderResourceValue(row[primaryKey], primaryKey)}
                  </p>
                </div>
                {config.columns.some((column) => column.key === "status") ? (
                  <div className="shrink-0">{renderResourceValue(row.status, "status")}</div>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3">
                {mobileColumns
                  .filter((column) => column.key !== primaryKey && column.key !== "status")
                  .map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-xs font-medium text-muted-foreground">{column.label}</dt>
                      <dd className="mt-0.5 truncate text-xs" title={formatResourceText(row[column.key], column.key)}>
                        {renderResourceValue(row[column.key], column.key)}
                      </dd>
                    </div>
                  ))}
              </dl>
              <div className="mt-3 border-t pt-2">
                <ResourceRowActions
                  config={config}
                  row={row}
                  disabled={mutationPending}
                  onDetail={onDetail}
                  onEdit={onEdit}
                  onAction={onAction}
                />
              </div>
            </article>
          );
        })}
      </div>}

      {isFetchNextPageError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>다음 목록을 불러오지 못했습니다. 현재 목록은 유지됩니다.</span>
          <Button
            ref={setRetryButtonRef}
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={onFetchNextPage}
          >
            <RefreshCw className={isFetchingNextPage ? "animate-spin" : undefined} />
            다음 목록 다시 시도
          </Button>
        </div>
      ) : null}

      {hasPreviousPage || (hasNextPage && !isFetchNextPageError) ? (
        <nav className="flex justify-center gap-2 pt-1" aria-label={`${config.title} 페이지`}>
          {hasPreviousPage ? (
            <Button variant="outline" onClick={onPreviousPage}>이전 목록</Button>
          ) : null}
          {hasNextPage && !isFetchNextPageError ? (
          <Button variant="outline" disabled={isFetchingNextPage} onClick={onFetchNextPage}>
            {isFetchingNextPage ? (
              <><RefreshCw className="animate-spin" /> 불러오는 중…</>
            ) : "더 보기"}
          </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
