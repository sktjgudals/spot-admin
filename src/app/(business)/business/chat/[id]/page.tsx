"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { uuidV7 } from "@/lib/uuid-v7";

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
  messageId?: string;
  clientMessageId?: string | null;
  seq: number | null;
  roomSequence?: number | null;
  roomId: string;
  senderType: "USER" | "BUSINESS" | "SYSTEM";
  senderNickname: string | null;
  content: string;
  type?: "TEXT" | "IMAGE" | "VIDEO";
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  deliveryState?: "pending" | "accepted" | "failed";
}

interface MessageAcceptance {
  state: "accepted";
  messageId: string;
  clientMessageId: string;
  roomSequence: number;
  acceptedAt: string;
  routeVersion: 2;
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

export default function BusinessChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const roomId = params.id as string;

  const { data: rooms = null } = useQuery({
    queryKey: queryKeys.chatRooms,
    queryFn: () => fetchJson<BizRoom[]>("/api/business/chat/rooms"),
    refetchInterval: ROOMS_POLL_MS,
  });

  const room = rooms?.find((r) => r.id === roomId) ?? null;

  const markRoomReadLocally = useCallback(() => {
    queryClient.setQueryData<BizRoom[]>(queryKeys.chatRooms, (prev) =>
      prev?.map((r) =>
        r.id === roomId ? { ...r, unreadCount: 0 } : r,
      ) ?? prev,
    );
  }, [queryClient, roomId]);

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const maxSeqRef = useRef(0);

  const markRead = useCallback(
    async (seq: number) => {
      if (seq < 1) return;
      await fetch(`/api/business/chat/rooms/${roomId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seq }),
      }).catch(() => null);
      markRoomReadLocally();
    },
    [roomId, markRoomReadLocally],
  );

  // 초기 로드 (최신 50개, desc → asc)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/business/chat/rooms/${roomId}/messages?limit=50`,
      ).catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        setMessages([]);
        toast.error("메시지를 불러오지 못했습니다");
        return;
      }
      const page = (await res.json()) as { messages: ChatMessage[] };
      const asc = [...page.messages].reverse();
      maxSeqRef.current = asc.at(-1)?.seq ?? 0;
      setMessages(asc);
      void markRead(maxSeqRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, markRead]);

  // 신규 메시지 폴링 (afterSeq 커서)
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch(
        `/api/business/chat/rooms/${roomId}/messages?afterSeq=${maxSeqRef.current}&limit=100`,
      ).catch(() => null);
      if (!res?.ok) return;
      const page = (await res.json()) as { messages: ChatMessage[] };
      if (page.messages.length === 0) return;
      setMessages((prev) => {
        const merged = [...(prev ?? [])];
        for (const committed of page.messages) {
          const index = merged.findIndex(
            (current) =>
              current.id === committed.id ||
              (committed.clientMessageId &&
                current.clientMessageId === committed.clientMessageId),
          );
          if (index >= 0) merged[index] = committed;
          else merged.push(committed);
        }
        return merged.sort((a, b) => {
          if (a.roomSequence != null && b.roomSequence != null) {
            return a.roomSequence - b.roomSequence;
          }
          if (a.seq != null && b.seq != null) return a.seq - b.seq;
          return a.seq == null ? 1 : -1;
        });
      });
      maxSeqRef.current = Math.max(
        maxSeqRef.current,
        ...page.messages.map((m) => m.seq ?? 0),
      );
      void markRead(maxSeqRef.current);
    }, MESSAGES_POLL_MS);
    return () => clearInterval(timer);
  }, [roomId, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    const clientMessageId = uuidV7();
    const optimistic: ChatMessage = {
      id: `local:${clientMessageId}`,
      clientMessageId,
      seq: null,
      roomId,
      senderType: "BUSINESS",
      senderNickname: null,
      content,
      type: "TEXT",
      createdAt: new Date().toISOString(),
      deliveryState: "pending",
    };
    setMessages((previous) => [...(previous ?? []), optimistic]);
    setInput("");
    try {
      const res = await fetch(`/api/business/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          clientMessageId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(data.message ?? "전송에 실패했습니다");
        setMessages((previous) =>
          previous?.map((message) =>
            message.clientMessageId === clientMessageId
              ? { ...message, deliveryState: "failed" }
              : message,
          ) ?? null,
        );
        return;
      }
      const accepted = (await res.json()) as MessageAcceptance;
      setMessages((previous) =>
        previous?.map((message) =>
          message.clientMessageId === accepted.clientMessageId
            ? {
                ...message,
                messageId: accepted.messageId,
                roomSequence: accepted.roomSequence,
                deliveryState: "accepted",
              }
            : message,
        ) ?? null,
      );
    } catch {
      setMessages((previous) =>
        previous?.map((message) =>
          message.clientMessageId === clientMessageId
            ? { ...message, deliveryState: "failed" }
            : message,
        ) ?? null,
      );
      toast.error("전송에 실패했습니다");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 border"
          onClick={() => router.push("/business/chat")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border shrink-0">
            {room?.userProfileImage && (
              <AvatarImage src={room.userProfileImage} />
            )}
            <AvatarFallback className="text-sm font-semibold">
              {(room?.userNickname ?? "유저").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold leading-none">
              {room?.userNickname ?? (rooms === null ? "불러오는 중..." : "탈퇴한 사용자")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">1:1 채팅 문의</p>
          </div>
        </div>
      </div>

      {/* 대화 영역 */}
      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background p-0 border">
        {/* 메시지 리스트 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages === null ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              대화 시작 전입니다. 메시지를 보내보세요.
            </div>
          ) : (
            messages.map((m) =>
              m.senderType === "SYSTEM" ? (
                <p
                  key={m.id}
                  className="text-center text-xs text-muted-foreground bg-muted/40 py-1.5 rounded-md"
                >
                  {m.content}
                </p>
              ) : (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col max-w-[70%] space-y-1",
                    m.senderType === "BUSINESS"
                      ? "ml-auto items-end"
                      : "items-start",
                  )}
                >
                  {m.type === "IMAGE" && m.mediaUrl ? (
                    <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.mediaUrl}
                        alt="첨부 이미지"
                        className="max-w-[280px] max-h-[280px] object-cover"
                      />
                    </a>
                  ) : m.type === "VIDEO" && m.mediaUrl ? (
                    <video
                      src={m.mediaUrl}
                      poster={m.thumbnailUrl ?? undefined}
                      controls
                      preload="metadata"
                      className="max-w-[320px] rounded-xl border"
                    />
                  ) : (
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed",
                        m.senderType === "BUSINESS"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted rounded-bl-sm",
                      )}
                    >
                      {m.content}
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground px-1">
                    {formatTime(m.createdAt)}
                    {m.deliveryState === "pending" && " · 전송 중"}
                    {m.deliveryState === "accepted" && " · 저장 중"}
                    {m.deliveryState === "failed" && " · 실패"}
                  </span>
                </div>
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>

        {/* 답장 입력 영역 */}
        <div className="border-t p-4 flex gap-3 bg-muted/20 shrink-0 items-end">
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
            className="min-h-[44px] max-h-32 resize-none bg-background"
            rows={1}
          />
          <Button
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            size="icon"
            className="shrink-0 h-11 w-11"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
