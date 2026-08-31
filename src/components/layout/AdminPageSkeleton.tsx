import { cn } from "@/lib/utils";

export function AdminPageSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn("admin-page space-y-5", compact && "px-4 pb-24 pt-5")}
      role="status"
      aria-label="화면 불러오는 중"
      aria-live="polite"
    >
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-7 w-44 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="surface-panel space-y-3 p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-7 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="surface-panel overflow-hidden">
        <div className="h-11 animate-pulse border-b bg-muted/50" />
        {Array.from({ length: compact ? 5 : 7 }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-4 border-b px-4 last:border-b-0">
            <div className="size-7 animate-pulse rounded-full bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">데이터를 준비하고 있습니다.</span>
    </div>
  );
}

