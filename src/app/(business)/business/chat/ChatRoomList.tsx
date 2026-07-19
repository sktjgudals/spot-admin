"use client";

import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, MessageSquare, ChevronRight } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useRouter } from "next/navigation";

interface BizRoom {
  id: string;
  userId: string | null;
  userNickname: string | null;
  userProfileImage: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

const ROOMS_POLL_MS = 15_000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatRoomList() {
  const router = useRouter();

  const { data: rooms = null } = useQuery({
    queryKey: queryKeys.chatRooms,
    queryFn: () => fetchJson<BizRoom[]>("/api/business/chat/rooms"),
    refetchInterval: ROOMS_POLL_MS,
  });

  return (
    <Card className="flex flex-col flex-1 min-h-0 bg-background overflow-hidden p-0 border">
      <div className="px-4 py-3 border-b text-sm font-semibold bg-muted/40 flex justify-between items-center">
        <span>문의 목록 {rooms ? `(${rooms.length})` : ""}</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y">
        {rooms === null ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <MessageSquare className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm">아직 등록된 문의가 없습니다.</p>
          </div>
        ) : (
          rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => router.push(`/business/chat/${room.id}`)}
              className="w-full text-left px-6 py-4 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <Avatar className="h-12 w-12 shrink-0 border">
                  {room.userProfileImage && (
                    <AvatarImage src={room.userProfileImage} />
                  )}
                  <AvatarFallback className="text-base font-semibold">
                    {(room.userNickname ?? "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold truncate text-foreground">
                      {room.userNickname ?? "탈퇴한 사용자"}
                    </span>
                    {room.lastMessageAt && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(room.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-[90%]">
                    {room.lastMessagePreview ?? "보낸 메시지가 없습니다."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {room.unreadCount > 0 && (
                  <Badge className="px-2 py-0.5 rounded-full text-xs font-bold" variant="default">
                    {room.unreadCount}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </div>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}
