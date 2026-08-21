"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import {
  businessChatQueryKeys,
  listBusinessOperatorRooms,
} from "@/auth/api/admin-chat.api";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileChrome";
import { formatClockTime } from "@/lib/format-date";

export function BusinessMobileChatList() {
  const { data, isLoading, error } = useQuery({
    queryKey: businessChatQueryKeys.rooms,
    queryFn: listBusinessOperatorRooms,
    refetchInterval: 15_000,
  });
  const rooms = data ?? [];

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-20">
      <header className="flex h-14 items-center px-4">
        <h1 className="text-[18px] font-bold">채팅</h1>
      </header>
      {isLoading && <p className="py-24 text-center text-[14px] text-[#686868]">불러오는 중…</p>}
      {error && <p className="px-4 py-20 text-center text-[14px] text-red-600">{error.message}</p>}
      {!isLoading && !error && rooms.length === 0 && (
        <div className="flex min-h-[620px] flex-col items-center justify-center px-5 text-center text-[14px] leading-[1.5] text-[#686868]">
          <p>아직 채팅 목록이 없어요.</p>
          <p>파티 생성 후 고객 문의가 오면 채팅이 표시됩니다.</p>
        </div>
      )}
      <div className="divide-y divide-white">
        {rooms.map((room) => (
          <Link
            key={room.id}
            href={`/app/chat/${encodeURIComponent(room.id)}`}
            className="flex min-h-[82px] items-center gap-3 bg-[#f5f5f5] px-4 py-3 transition-colors hover:bg-[#f0e9fc]"
          >
            <div className="grid size-[46px] shrink-0 place-items-center overflow-hidden rounded-full border border-[#dedede] bg-white text-[#b8b8b8]">
              {room.userProfileImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- runtime user media URL.
                <img src={room.userProfileImage} alt="" className="size-full object-cover" />
              ) : (
                <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <strong className="min-w-0 flex-1 truncate text-[16px]">{room.userNickname || "탈퇴한 사용자"}</strong>
                <time className="shrink-0 text-[12px] text-[#8f8f8f]">{room.lastMessageAt ? formatTime(room.lastMessageAt) : ""}</time>
              </div>
              <p className="mt-1 line-clamp-2 text-[14px] leading-[1.5] text-[#686868]">{room.lastMessagePreview || "보낸 메시지가 없습니다."}</p>
            </div>
            {room.unreadCount > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-[#e4003b] px-1.5 py-0.5 text-[12px] font-bold text-white">
                {room.unreadCount > 99 ? "99+" : room.unreadCount}
              </span>
            )}
          </Link>
        ))}
      </div>
      <BusinessBottomNav />
    </div>
  );
}
function formatTime(value: string): string {
  return formatClockTime(value);
}
