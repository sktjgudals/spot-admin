"use client";

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, TriangleAlert } from "lucide-react";
import type { UserTimelineItem } from "@/auth/api/admin-users.api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCursorAppendFocus } from "@/hooks/use-cursor-append-focus";
import { formatClockTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  TIMELINE_CATEGORIES,
  TIMELINE_PERIODS,
  TIMELINE_REF_LABELS,
  TIMELINE_SOURCE_LABELS,
  coverageSummaryText,
  filterTimelineItems,
  groupTimelineByDay,
  kindsForCategories,
  timelineCategoryLabel,
  timelineFromIso,
  timelineKindIcon,
  timelineKindLabel,
  timelineRefHref,
  timelineRefsOf,
  type TimelinePeriod,
} from "./user-timeline-model";
import { useUserTimelineQuery } from "./use-user-timeline-query";

export function UserFlowTimeline({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<readonly string[]>([]);
  const [period, setPeriod] = useState<TimelinePeriod>("28d");
  // `Date.now()` is read exactly once, in this lazy initializer — the only
  // place React allows an impure read during render. Everything downstream
  // (the `useMemo` below) stays a pure function of already-known values, so
  // `from` is still pinned per period instead of drifting on every render.
  const [mountedAt] = useState(() => Date.now());
  const from = useMemo(() => timelineFromIso(period, mountedAt), [period, mountedAt]);
  const kinds = useMemo(() => kindsForCategories(categories), [categories]);
  const timeline = useUserTimelineQuery(userId, { categories, kinds, from });

  // `timeline.data?.pages ?? []` would hand out a fresh `[]` identity on every
  // render whenever there is no data yet, which would defeat the `items`
  // memo below — so `pages` gets its own memo first.
  const pages = useMemo(() => timeline.data?.pages ?? [], [timeline.data]);
  const items = useMemo(() => pages.flatMap((entry) => entry.items), [pages]);
  const visibleItems = useMemo(
    () => filterTimelineItems(items, categories),
    [items, categories],
  );
  const groups = useMemo(() => groupTimelineByDay(visibleItems), [visibleItems]);
  const lastPage = pages.at(-1);

  const { beginAppend, setFallbackRef, setItemRef, setRetryButtonRef } =
    useCursorAppendFocus<HTMLLIElement>({
      scopeKey: `${userId} ${period} ${[...categories].sort().join(",")}`,
      itemKeys: visibleItems.map((entry) => entry.id),
      isFetchingNextPage: timeline.isFetchingNextPage,
      isFetchNextPageError: timeline.isFetchNextPageError,
      hasNextPage: Boolean(timeline.hasNextPage),
    });

  const loadNextPage = () => {
    beginAppend();
    void timeline.fetchNextPage();
  };

  const toggleCategory = (value: string) => {
    setCategories((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="플로우 분류" className="flex flex-wrap gap-1">
          {TIMELINE_CATEGORIES.map((category) => {
            const pressed = categories.includes(category.value);
            return (
              <button
                key={category.value}
                type="button"
                aria-pressed={pressed}
                className={cn(
                  "min-h-8 rounded-lg border px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  pressed && "border-primary/40 bg-primary/10 text-foreground",
                )}
                onClick={() => toggleCategory(category.value)}
              >
                {category.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="기간"
            className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
            value={period}
            onChange={(event) => setPeriod(event.target.value as TimelinePeriod)}
          >
            {TIMELINE_PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={timeline.isFetching}
            onClick={() => void timeline.refetch()}
          >
            <RefreshCw className={timeline.isFetching ? "animate-spin" : undefined} />
            새로고침
          </Button>
        </div>
      </div>

      {lastPage ? (
        <div className="rounded-xl border bg-muted/25 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            {coverageSummaryText({
              from,
              asOf: lastPage.asOf,
              coverage: lastPage.coverage,
              categories,
            })}
          </p>
          {lastPage.coverage.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {lastPage.coverage.map((entry, index) => (
                <li
                  key={`${entry.category}:${index}`}
                  className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2"
                >
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 leading-6">{entry.note}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {timeline.isPending ? (
        <TimelineSkeleton />
      ) : timeline.isError && items.length === 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
        >
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">활동을 불러오지 못했습니다.</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {timeline.error instanceof Error
                  ? timeline.error.message
                  : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void timeline.refetch()}
              >
                <RefreshCw /> 다시 시도
              </Button>
            </div>
          </div>
        </div>
      ) : visibleItems.length === 0 ? (
        <div
          ref={setFallbackRef}
          tabIndex={-1}
          className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <p className="font-medium">
            {items.length === 0 ? "표시할 활동이 없습니다" : "조건에 맞는 활동이 없습니다"}
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {items.length === 0
              ? "이 기간에 기록된 활동이 없습니다. 기간을 넓혀 다시 확인해 주세요."
              : "선택한 분류를 해제하면 나머지 활동이 다시 보입니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.day} className="space-y-1">
              <h3 className="text-xs font-semibold tracking-[0.04em] text-muted-foreground">
                {group.label}
              </h3>
              <ol className="divide-y rounded-xl border bg-card px-3">
                {group.items.map((entry) => (
                  <TimelineRow key={entry.id} item={entry} setItemRef={setItemRef} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {timeline.isFetchNextPageError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span>다음 활동을 불러오지 못했습니다. 이미 불러온 활동은 그대로 유지했습니다.</span>
          <Button
            ref={setRetryButtonRef}
            variant="outline"
            size="sm"
            disabled={timeline.isFetchingNextPage}
            onClick={loadNextPage}
          >
            <RefreshCw
              className={timeline.isFetchingNextPage ? "animate-spin" : undefined}
            />
            다음 페이지 다시 시도
          </Button>
        </div>
      ) : timeline.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={timeline.isFetchingNextPage}
            onClick={loadNextPage}
          >
            {timeline.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TimelineRow({
  item,
  setItemRef,
}: {
  item: UserTimelineItem;
  setItemRef: (key: string, node: HTMLLIElement | null) => void;
}) {
  // Rendered through `createElement`, not JSX (`<KindIcon />`): the icon
  // component is picked dynamically per row, and JSX-ing a render-scoped
  // variable makes React treat it as a brand-new component type every
  // render, remounting the icon instead of reusing it.
  const kindIcon = createElement(timelineKindIcon(item.kind), {
    className: "size-3.5",
    "aria-hidden": true,
  });
  // The normalizer falls back to the raw kind when the server sends no title.
  const title = item.title === item.kind ? timelineKindLabel(item.kind) : item.title;
  const refs = timelineRefsOf(item.refs);

  return (
    <li
      ref={(node) => setItemRef(item.id, node)}
      tabIndex={-1}
      className="flex gap-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border bg-muted/50 text-muted-foreground"
        title={timelineKindLabel(item.kind)}
      >
        {kindIcon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatClockTime(item.at)}
          </span>
          <Badge variant="outline">{timelineCategoryLabel(item.category)}</Badge>
          <p className="min-w-0 font-medium">{title}</p>
          <span className="ml-auto text-xs text-muted-foreground">
            {TIMELINE_SOURCE_LABELS[item.source] ?? item.source}
          </span>
        </div>
        {item.detail ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {item.detail}
          </p>
        ) : null}
        {refs.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {refs.map((ref) => {
              const href = timelineRefHref(ref);
              const label = `${TIMELINE_REF_LABELS[ref.kind]} · ${ref.id}`;
              return href ? (
                <Link
                  key={`${ref.kind}:${ref.id}`}
                  href={href}
                  prefetch={false}
                  className="rounded-sm text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {label}
                </Link>
              ) : (
                <Badge
                  key={`${ref.kind}:${ref.id}`}
                  variant="outline"
                  className="font-mono font-normal"
                >
                  {label}
                </Badge>
              );
            })}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-xl border bg-card p-3">
          <div className="size-7 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
