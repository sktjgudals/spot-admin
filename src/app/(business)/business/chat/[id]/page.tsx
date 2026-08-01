"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { fetchJson, bffFetch } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { uuidV7 } from "@/lib/uuid-v7";
import {
  adminChatGatewayUrl,
  issueAdminChatGatewayTicket,
} from "@/auth/api/admin-chat.api";

interface BizRoom {
  id: string;
  userId: string | null;
  userNickname: string | null;
  userProfileImage: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  assignedAdminUserId: string | null;
}

interface BusinessChatAssignee {
  id: string;
  name: string;
  userId: string | null;
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
  deliveryState?: "pending" | "accepted" | "committed" | "failed";
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
  const { data: assignees = [] } = useQuery({
    queryKey: ["business-chat-assignees"],
    queryFn: () =>
      fetchJson<BusinessChatAssignee[]>("/api/business/chat/assignees"),
  });
  const assignment = useMutation({
    mutationFn: async (assigneeAdminId: string | null) => {
      const res = await bffFetch(
        `/api/business/chat/rooms/${roomId}/assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigneeAdminId }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "담당자를 변경하지 못했습니다");
      }
      return (await res.json()) as {
        assignedAdminId: string | null;
        assignedAdminName: string | null;
        assignedAdminUserId: string | null;
      };
    },
    onSuccess: (next) => {
      queryClient.setQueryData<BizRoom[]>(
        queryKeys.chatRooms,
        (previous) =>
          previous?.map((item) =>
            item.id === roomId ? { ...item, ...next } : item,
          ) ?? previous,
      );
      toast.success(
        next.assignedAdminId
          ? "문의 담당자를 지정했습니다"
          : "미지정으로 변경했습니다. 운영자 전원에게 알림이 갑니다.",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "담당자를 변경하지 못했습니다",
      );
    },
  });

  const markRoomReadLocally = useCallback(() => {
    queryClient.setQueryData<BizRoom[]>(
      queryKeys.chatRooms,
      (prev) =>
        prev?.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)) ??
        prev,
    );
  }, [queryClient, roomId]);

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const maxSeqRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const ackSequenceRef = useRef(0);
  const joinAckRef = useRef<string | null>(null);
  const pendingSendAcksRef = useRef(new Map<string, string>());
  const [socketState, setSocketState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");

  const emit = useCallback((type: string, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return null;
    const ackId = `web-${++ackSequenceRef.current}`;
    socket.send(JSON.stringify({ type, ackId, payload }));
    return ackId;
  }, []);

  const markRead = useCallback(
    async (seq: number) => {
      if (seq < 1) return;
      emit("chat:read", { roomId, roomSeq: seq });
      markRoomReadLocally();
    },
    [emit, roomId, markRoomReadLocally],
  );

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const mergeCommitted = (raw: Record<string, unknown>) => {
      const roomSeq = Number(raw.roomSeq ?? 0);
      const committed: ChatMessage = {
        id: String(raw.messageId ?? raw.id),
        messageId: String(raw.messageId ?? raw.id),
        clientMessageId:
          typeof raw.clientMessageId === "string" ? raw.clientMessageId : null,
        seq: roomSeq,
        roomSequence: roomSeq,
        roomId: String(raw.roomId ?? roomId),
        senderType:
          raw.senderType === "BUSINESS" || raw.senderType === "SYSTEM"
            ? raw.senderType
            : "USER",
        senderNickname:
          typeof raw.senderNickname === "string" ? raw.senderNickname : null,
        content: typeof raw.content === "string" ? raw.content : "",
        type: raw.type === "IMAGE" || raw.type === "VIDEO" ? raw.type : "TEXT",
        createdAt:
          typeof raw.createdAt === "string"
            ? raw.createdAt
            : new Date().toISOString(),
        deliveryState: "committed",
      };
      setMessages((previous) => {
        const merged = [...(previous ?? [])];
        const index = merged.findIndex(
          (message) =>
            message.id === committed.id ||
            (committed.clientMessageId != null &&
              message.clientMessageId === committed.clientMessageId),
        );
        if (index >= 0) merged[index] = committed;
        else merged.push(committed);
        return merged.sort(
          (left, right) =>
            (left.roomSequence ?? Number.MAX_SAFE_INTEGER) -
            (right.roomSequence ?? Number.MAX_SAFE_INTEGER),
        );
      });
      maxSeqRef.current = Math.max(maxSeqRef.current, roomSeq);
      void markRead(roomSeq);
    };

    const connect = async () => {
      setSocketState("connecting");
      try {
        const ticket = await issueAdminChatGatewayTicket(roomId);
        if (cancelled) return;
        const url = new URL(adminChatGatewayUrl());
        url.searchParams.set("token", ticket.accessToken);
        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.onopen = () => {
          const ackId = `web-${++ackSequenceRef.current}`;
          joinAckRef.current = ackId;
          socket.send(
            JSON.stringify({
              type: "chat:join",
              ackId,
              payload: { roomId, generation: 1 },
            }),
          );
        };
        socket.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          let frame: Record<string, unknown>;
          try {
            frame = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            return;
          }
          if (frame.type === "ack") {
            const ackId = typeof frame.ackId === "string" ? frame.ackId : "";
            if (ackId === joinAckRef.current) {
              joinAckRef.current = null;
              setSocketState(frame.ok === true ? "connected" : "disconnected");
              return;
            }
            const clientMessageId = pendingSendAcksRef.current.get(ackId);
            if (!clientMessageId) return;
            pendingSendAcksRef.current.delete(ackId);
            const data =
              frame.data && typeof frame.data === "object"
                ? (frame.data as Record<string, unknown>)
                : {};
            setMessages(
              (previous) =>
                previous?.map((message) =>
                  message.clientMessageId === clientMessageId
                    ? {
                        ...message,
                        messageId:
                          typeof data.messageId === "string"
                            ? data.messageId
                            : message.messageId,
                        deliveryState:
                          frame.ok === true ? "accepted" : "failed",
                      }
                    : message,
                ) ?? null,
            );
            if (frame.ok !== true) toast.error("전송에 실패했습니다");
            return;
          }
          const payload =
            frame.payload && typeof frame.payload === "object"
              ? (frame.payload as Record<string, unknown>)
              : {};
          if (frame.type === "chat:message-committed") mergeCommitted(payload);
          if (frame.type === "chat:message-rejected") {
            const clientMessageId = payload.clientMessageId;
            setMessages(
              (previous) =>
                previous?.map((message) =>
                  message.clientMessageId === clientMessageId
                    ? { ...message, deliveryState: "failed" }
                    : message,
                ) ?? null,
            );
          }
        };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          setSocketState("disconnected");
          if (!cancelled)
            reconnectTimer = setTimeout(() => void connect(), 1500);
        };
        socket.onerror = () => socket.close();
      } catch {
        setSocketState("disconnected");
        if (!cancelled) reconnectTimer = setTimeout(() => void connect(), 3000);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "chat:leave",
            ackId: `web-${++ackSequenceRef.current}`,
            payload: { roomId },
          }),
        );
      }
      socket?.close();
      pendingSendAcksRef.current.clear();
    };
  }, [markRead, roomId]);

  // 초기 로드 (최신 50개, desc → asc)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await bffFetch(
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
      const res = await bffFetch(
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
    if (!content || sending || socketState !== "connected") return;
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
      const ackId = emit("chat:send", {
        roomId,
        content,
        clientMessageId,
        clientCreatedAt: optimistic.createdAt,
        type: "TEXT",
      });
      if (!ackId) throw new Error("CHAT_GATEWAY_DISCONNECTED");
      pendingSendAcksRef.current.set(ackId, clientMessageId);
    } catch {
      setMessages(
        (previous) =>
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
        <div className="flex items-center gap-3 min-w-0">
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
              {room?.userNickname ??
                (rooms === null ? "불러오는 중..." : "탈퇴한 사용자")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">1:1 채팅 문의</p>
            <p className="text-[10px] text-muted-foreground">
              {socketState === "connected"
                ? "실시간 연결됨"
                : socketState === "connecting"
                  ? "연결 중"
                  : "재연결 중"}
            </p>
          </div>
        </div>
        <div className="ml-auto w-[220px]">
          <Select
            value={room?.assignedAdminId ?? "__unassigned__"}
            disabled={!room || assignment.isPending}
            onValueChange={(value) =>
              assignment.mutate(value === "__unassigned__" ? null : value)
            }
          >
            <SelectTrigger aria-label="문의 담당자">
              <SelectValue placeholder="담당자 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">미지정 · 전원 알림</SelectItem>
              {assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                  {assignee.userId ? "" : " · 앱 미연결"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    <a
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl overflow-hidden border"
                    >
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
            disabled={sending || !input.trim() || socketState !== "connected"}
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
