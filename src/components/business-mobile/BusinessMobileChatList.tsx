"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, MessageSquareText, RefreshCw, UserRound } from "lucide-react";
import {
  businessChatQueryKeys,
  listBusinessOperatorRooms,
} from "@/auth/api/admin-chat.api";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileNavigation";
import { Button } from "@/components/ui/button";
import { DopaMediaImage } from "@/components/ui/dopa-media-image";
import { formatClockTime } from "@/lib/format-date";

export const CHAT_LIST_REFRESH_INTERVAL_MS = 60_000;
const CHAT_LIST_WINDOW_SIZE = 30;
const CHAT_LIST_ENDPOINT_CAP = 100;

export function getChatListRefreshInterval(): number | false {
  if (
    typeof document !== "undefined" &&
    document.visibilityState !== "visible"
  ) {
    return false;
  }

  return CHAT_LIST_REFRESH_INTERVAL_MS;
}

export function BusinessMobileChatList() {
  const [visibleCount, setVisibleCount] = useState(CHAT_LIST_WINDOW_SIZE);
  const roomRefs = useRef(new Map<string, HTMLAnchorElement>());
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: businessChatQueryKeys.rooms,
    queryFn: listBusinessOperatorRooms,
    staleTime: 30_000,
    refetchInterval: getChatListRefreshInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const rooms = data ?? [];
  const visibleRooms = rooms.slice(0, visibleCount);
  const hasMoreVisibleRooms = visibleCount < rooms.length;
  const isPossiblyTruncated = rooms.length === CHAT_LIST_ENDPOINT_CAP;

  function revealMoreRooms() {
    const firstNewRoomId = rooms[visibleCount]?.id;
    setVisibleCount((count) => count + CHAT_LIST_WINDOW_SIZE);
    if (firstNewRoomId) {
      window.requestAnimationFrame(() => roomRefs.current.get(firstNewRoomId)?.focus());
    }
  }

  return (
    <div className="min-h-dvh bg-background pb-24 font-pretendard md:pb-8">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-medium text-primary">고객 커뮤니케이션</p>
          <h1 className="text-xl font-bold">채팅</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          aria-label="채팅 목록 새로고침"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden />
          <span className="hidden sm:inline">새로고침</span>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        {isLoading && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="채팅 목록을 불러오는 중" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl border bg-muted/60" />
            ))}
          </div>
        )}
        {error && (
          <section className="grid min-h-72 place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <div>
              <p className="font-medium text-destructive">채팅 목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button type="button" variant="outline" className="mt-4 min-h-11" disabled={isFetching} onClick={() => void refetch()}>
                <RefreshCw className={isFetching ? "animate-spin" : undefined} />
                다시 시도
              </Button>
            </div>
          </section>
        )}
        {!isLoading && !error && rooms.length === 0 && (
          <section className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed bg-muted/20 px-5 text-center">
            <div>
              <MessageSquareText className="mx-auto size-9 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">아직 채팅 목록이 없어요.</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                파티 생성 후 고객 문의가 오면 채팅이 표시됩니다.
              </p>
            </div>
          </section>
        )}
        {!isLoading && !error && rooms.length > 0 && (
          <section aria-label="최근 채팅">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {Math.min(visibleCount, rooms.length)} / {rooms.length}개 대화 표시 중
              </p>
              <p className="text-xs text-muted-foreground">화면을 보고 있을 때 1분마다 자동 갱신</p>
            </div>
            {isPossiblyTruncated && (
              <div className="mb-3 flex gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground" role="note">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <p>
                  서버가 제공하는 최근 100개 대화만 표시합니다. 더 오래된 대화는 이 목록에 포함되지 않을 수 있어요.
                </p>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleRooms.map((room) => (
                <Link
                  key={room.id}
                  ref={(node) => {
                    if (node) roomRefs.current.set(room.id, node);
                    else roomRefs.current.delete(room.id);
                  }}
                  href={`/app/chat/${encodeURIComponent(room.id)}`}
                  className="flex min-h-24 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-card-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
                    {room.userProfileImage ? (
                      <DopaMediaImage
                        src={room.userProfileImage}
                        transformWidth={80}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <strong className="min-w-0 flex-1 truncate text-base">{room.userNickname || "탈퇴한 사용자"}</strong>
                      <time className="shrink-0 text-xs text-muted-foreground">{room.lastMessageAt ? formatTime(room.lastMessageAt) : ""}</time>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{room.lastMessagePreview || "보낸 메시지가 없습니다."}</p>
                  </div>
                  {room.unreadCount > 0 && (
                    <span className="grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}>
                      {room.unreadCount > 99 ? "99+" : room.unreadCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {hasMoreVisibleRooms && (
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 min-w-40"
                  onClick={revealMoreRooms}
                >
                  대화 더 보기
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
      <BusinessBottomNav />
    </div>
  );
}
function formatTime(value: string): string {
  return formatClockTime(value);
}
