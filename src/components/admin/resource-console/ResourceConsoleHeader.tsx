import { FilterX, Plus, RefreshCw, Search, X } from "lucide-react";
import type { ResourceConfig } from "@/components/admin/resource-configs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { getStatusLabel, getStatusTone } from "./formatters";

type ResourceConsoleHeaderProps = {
  config: ResourceConfig;
  count: number;
  hasNextPage: boolean;
  asOf?: string;
  hasData: boolean;
  isFetching: boolean;
  isPending: boolean;
  search: string;
  query: string;
  status: string;
  hasFilters: boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onStatusChange: (value: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onCreate: () => void;
};

export function ResourceConsoleHeader({
  config,
  count,
  hasNextPage,
  asOf,
  hasData,
  isFetching,
  isPending,
  search,
  query,
  status,
  hasFilters,
  onSearchChange,
  onSearchSubmit,
  onStatusChange,
  onClearFilters,
  onRefresh,
  onCreate,
}: ResourceConsoleHeaderProps) {
  return (
    <>
      <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id={`${config.key}-title`} className="text-xl font-semibold tracking-tight sm:text-2xl">
              {config.title}
            </h1>
            {isFetching && !isPending ? (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <RefreshCw className="animate-spin" /> 갱신 중
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {config.description}
          </p>
          <p className="mt-1.5 min-h-4 text-xs text-muted-foreground" aria-live="polite">
            {hasData && asOf
              ? `${count.toLocaleString("ko-KR")}건${hasNextPage ? "+" : ""} · 기준 ${formatDateTime(asOf)}`
              : " "}
          </p>
        </div>
        {config.create ? (
          <Button size="sm" className="w-full sm:w-auto" onClick={onCreate}>
            <Plus /> {config.create.label}
          </Button>
        ) : null}
      </header>

      <div className="rounded-xl border bg-card p-3 shadow-sm shadow-foreground/[0.02]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <form
            role="search"
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSearchSubmit();
            }}
          >
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={`${config.title} 검색어`}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="이름, ID, 제목 등 검색"
                className="w-full pl-8 pr-8"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSearchChange("")}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <Button type="submit" variant="outline">검색</Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {config.statusOptions?.length ? (
              <select
                aria-label={`${config.title} 상태 필터`}
                className="h-8 min-w-32 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
                value={status}
                onChange={(event) => onStatusChange(event.target.value)}
              >
                <option value="">전체 상태</option>
                {config.statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : null}
            <Button type="button" variant="outline" disabled={isFetching} onClick={onRefresh}>
              <RefreshCw className={cn(isFetching && "animate-spin")} />
              새로고침
            </Button>
          </div>
        </div>
        {hasFilters ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
            <span className="mr-1 text-xs font-medium text-muted-foreground">적용된 필터</span>
            {query ? <Badge variant="secondary">검색: {query}</Badge> : null}
            {status ? (
              <Badge variant="outline" className={getStatusTone(status)}>
                상태: {config.statusOptions?.find((option) => option.value === status)?.label ?? getStatusLabel(status)}
              </Badge>
            ) : null}
            <Button type="button" size="xs" variant="ghost" onClick={onClearFilters}>
              <FilterX /> 필터 초기화
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
