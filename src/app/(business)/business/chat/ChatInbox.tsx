"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

interface BizRoom {
  id: string;
  userId: string | null;
  userNickname: string | null;
  userProfileImage: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  seq: number;
  roomId: string;
  senderType: "USER" | "BUSINESS" | "SYSTEM";
  senderNickname: string | null;
  content: string;
  createdAt: string;
}

const ROOMS_POLL_MS = 15_000;
const MESSAGES_POLL_MS = 5_000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatInbox() {
  const [rooms, setRooms] = useState<BizRoom[] | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/business/chat/rooms").catch(() => null);
    if (!res?.ok) return;
    setRooms((await res.json()) as BizRoom[]);
  }, []);

  useEffect(() => {
    void loadRooms();
    const timer = setInterval(loadRooms, ROOMS_POLL_MS);
    return () => clearInterval(timer);
  }, [loadRooms]);

  const activeRoom = rooms?.find((r) => r.id === activeRoomId) ?? null;

  return (
    <Card className="flex flex-1 min-h-0 overflow-hidden p-0">
      {/* 좌: 방 목록 */}
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="px-4 py-3 border-b text-sm font-medium">
          문의 목록 {rooms ? `(${rooms.length})` : ""}
        </div>
        <div className="flex-1 overflow-y-auto">
          {rooms === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              아직 문의가 없습니다
            </div>
          ) : (
            rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => {
                  setActiveRoomId(room.id);
                  // 목록 배지 낙관적 리셋 (서버 반영은 대화 로드가 수행)
                  setRooms((prev) =>
                    prev?.map((r) =>
                      r.id === room.id ? { ...r, unreadCount: 0 } : r,
                    ) ?? null,
                  );
                }}
                className={cn(
                  "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                  activeRoomId === room.id && "bg-muted",
                )}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 shrink-0">
                    {room.userProfileImage && (
                      <AvatarImage src={room.userProfileImage} />
                    )}
                    <AvatarFallback>
                      {(room.userNickname ?? "?").slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {room.userNickname ?? "탈퇴한 사용자"}
                      </span>
                      {room.unreadCount > 0 && (
                        <Badge className="shrink-0">{room.unreadCount}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {room.lastMessagePreview ?? "메시지 없음"}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 우: 대화 */}
      {activeRoom ? (
        <ChatThread
          key={activeRoom.id}
          room={activeRoom}
          onRead={() =>
            setRooms((prev) =>
              prev?.map((r) =>
                r.id === activeRoom.id ? { ...r, unreadCount: 0 } : r,
              ) ?? null,
            )
          }
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <MessageSquare className="h-8 w-8" />
          <p className="text-sm">문의를 선택하세요</p>
        </div>
      )}
    </Card>
  );
}

function ChatThread({ room, onRead }: { room: BizRoom; onRead: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const maxSeqRef = useRef(0);

  const markRead = useCallback(
    async (seq: number) => {
      if (seq < 1) return;
      await fetch(`/api/business/chat/rooms/${room.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seq }),
      }).catch(() => null);
      onRead();
    },
    [room.id, onRead],
  );

  // 초기 로드 (최신 50개, desc → asc)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/business/chat/rooms/${room.id}/messages?limit=50`,
      ).catch(() => null);
      if (!res?.ok || cancelled) return;
      const page = (await res.json()) as { messages: ChatMessage[] };
      const asc = [...page.messages].reverse();
      maxSeqRef.current = asc.at(-1)?.seq ?? 0;
      setMessages(asc);
      void markRead(maxSeqRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id, markRead]);

  // 신규 메시지 폴링 (afterSeq 커서)
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch(
        `/api/business/chat/rooms/${room.id}/messages?afterSeq=${maxSeqRef.current}&limit=100`,
      ).catch(() => null);
      if (!res?.ok) return;
      const page = (await res.json()) as { messages: ChatMessage[] };
      if (page.messages.length === 0) return;
      setMessages((prev) => {
        const known = new Set((prev ?? []).map((m) => m.id));
        const fresh = page.messages.filter((m) => !known.has(m.id));
        return [...(prev ?? []), ...fresh];
      });
      maxSeqRef.current = Math.max(
        maxSeqRef.current,
        ...page.messages.map((m) => m.seq),
      );
      void markRead(maxSeqRef.current);
    }, MESSAGES_POLL_MS);
    return () => clearInterval(timer);
  }, [room.id, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/business/chat/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          clientMessageId: `admin-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(data.message ?? "전송에 실패했습니다");
        return;
      }
      const sent = (await res.json()) as ChatMessage;
      setMessages((prev) =>
        prev?.some((m) => m.id === sent.id)
          ? prev
          : [...(prev ?? []), sent],
      );
      maxSeqRef.current = Math.max(maxSeqRef.current, sent.seq);
      setInput("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-sm font-medium">
          {room.userNickname ?? "탈퇴한 사용자"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map((m) =>
            m.senderType === "SYSTEM" ? (
              <p
                key={m.id}
                className="text-center text-xs text-muted-foreground"
              >
                {m.content}
              </p>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col max-w-[70%]",
                  m.senderType === "BUSINESS"
                    ? "ml-auto items-end"
                    : "items-start",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    m.senderType === "BUSINESS"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm",
                  )}
                >
                  {m.content}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {formatTime(m.createdAt)}
                </span>
              </div>
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex gap-2 shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="답장 입력 (Enter 전송 · Shift+Enter 줄바꿈)"
          className="min-h-[40px] max-h-32 resize-none"
          rows={1}
        />
        <Button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          size="icon"
          className="shrink-0 self-end"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
