"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Menu, Plus, UserRound } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminChatGatewayUrl,
  businessChatQueryKeys,
  issueAdminChatGatewayTicket,
  listBusinessOperatorMessages,
  listBusinessOperatorRooms,
  markBusinessOperatorRoomRead,
  type BusinessOperatorMessage,
} from "@/auth/api/admin-chat.api";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { uuidV7 } from "@/lib/uuid-v7";
import { cn } from "@/lib/utils";
import { formatClockTime } from "@/lib/format-date";

export function BusinessMobileChatRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { admin } = useAdminAuth();
  const rooms = useQuery({
    queryKey: businessChatQueryKeys.rooms,
    queryFn: listBusinessOperatorRooms,
    refetchInterval: 15_000,
  });
  const room = rooms.data?.find((item) => item.id === roomId) ?? null;
  const [messages, setMessages] = useState<BusinessOperatorMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const maxSeqRef = useRef(0);
  const ackRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReadSeqRef = useRef(0);
  const sendTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const flushRead = useCallback(() => {
    const seq = pendingReadSeqRef.current;
    if (seq > 0) {
      void markBusinessOperatorRoomRead(roomId, seq).catch(() => undefined);
    }
  }, [roomId]);

  const scheduleRead = useCallback(
    (seq: number) => {
      pendingReadSeqRef.current = Math.max(pendingReadSeqRef.current, seq);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      readTimerRef.current = setTimeout(flushRead, 400);
    },
    [flushRead],
  );

  const mergeMessage = useCallback((raw: Record<string, unknown>) => {
    const message = normalizeMessage(raw, roomId);
    setMessages((current) => {
      const next = [...(current ?? [])];
      const index = next.findIndex(
        (item) =>
          item.id === message.id ||
          (message.clientMessageId && item.clientMessageId === message.clientMessageId),
      );
      if (index >= 0) next[index] = message;
      else next.push(message);
      return next.sort((left, right) => left.roomSeq - right.roomSeq);
    });
    if (message.clientMessageId) {
      const timer = sendTimersRef.current.get(message.clientMessageId);
      if (timer) {
        clearTimeout(timer);
        sendTimersRef.current.delete(message.clientMessageId);
      }
    }
    maxSeqRef.current = Math.max(maxSeqRef.current, message.roomSeq);
    scheduleRead(message.roomSeq);
  }, [roomId, scheduleRead]);

  useEffect(() => {
    let cancelled = false;
    void listBusinessOperatorMessages(roomId)
      .then((page) => {
        if (cancelled) return;
        const ordered = [...page.messages].sort((a, b) => a.roomSeq - b.roomSeq);
        maxSeqRef.current = ordered.at(-1)?.roomSeq ?? 0;
        setMessages(ordered);
        if (maxSeqRef.current > 0) {
          scheduleRead(maxSeqRef.current);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessages([]);
          toast.error(error instanceof Error ? error.message : "메시지를 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, scheduleRead]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const connect = async () => {
      try {
        const ticket = await issueAdminChatGatewayTicket(roomId);
        if (cancelled) return;
        const url = new URL(adminChatGatewayUrl());
        url.searchParams.set("token", ticket.accessToken);
        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.onopen = () => {
          attempt = 0;
          socket.send(JSON.stringify({ type: "chat:join", ackId: `web-${++ackRef.current}`, payload: { roomId, generation: 1 } }));
          setConnected(true);
        };
        socket.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          try {
            const frame = JSON.parse(event.data) as { type?: string; payload?: Record<string, unknown> };
            if (frame.type === "chat:message-committed" && frame.payload) mergeMessage(frame.payload);
          } catch {
            // Ignore malformed transport frames; the socket remains usable.
          }
        };
        socket.onclose = () => {
          setConnected(false);
          if (!cancelled) {
            const delay = Math.min(30_000, 1_000 * 2 ** attempt);
            attempt += 1;
            reconnectTimer = setTimeout(() => void connect(), delay);
          }
        };
        socket.onerror = () => socket.close();
      } catch {
        setConnected(false);
        if (!cancelled) {
          const delay = Math.min(30_000, 1_000 * 2 ** attempt);
          attempt += 1;
          reconnectTimer = setTimeout(() => void connect(), delay);
        }
      }
    };
    void connect();
    const sendTimers = sendTimersRef.current;
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      flushRead();
      for (const timer of sendTimers.values()) clearTimeout(timer);
      sendTimers.clear();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [flushRead, mergeMessage, roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  function markFailed(clientMessageId: string) {
    setMessages((current) =>
      (current ?? []).map((item) =>
        item.clientMessageId === clientMessageId && item.deliveryState === "pending"
          ? { ...item, deliveryState: "failed" }
          : item,
      ),
    );
  }

  function send() {
    const body = input.trim();
    const socket = socketRef.current;
    if (!body) return;
    const clientMessageId = uuidV7();
    const createdAt = new Date().toISOString();
    const socketOpen = socket != null && socket.readyState === WebSocket.OPEN;
    const optimistic: BusinessOperatorMessage = {
      id: `local:${clientMessageId}`,
      roomSeq: Number.MAX_SAFE_INTEGER,
      roomId,
      senderType: "BUSINESS",
      senderId: null,
      senderNickname: null,
      senderProfileImage: null,
      senderIsBusinessAdmin: true,
      body,
      type: "TEXT",
      mediaUrl: null,
      thumbnailUrl: null,
      clientMessageId,
      createdAt,
      deliveryState: socketOpen ? "pending" : "failed",
    };
    setMessages((current) => [...(current ?? []), optimistic]);
    setInput("");
    if (!socketOpen || !socket) {
      toast.error("연결이 끊어져 메시지를 보내지 못했습니다.");
      return;
    }
    socket.send(JSON.stringify({
      type: "chat:send",
      ackId: `web-${++ackRef.current}`,
      payload: { roomId, content: body, clientMessageId, clientCreatedAt: createdAt, type: "TEXT" },
    }));
    sendTimersRef.current.set(
      clientMessageId,
      setTimeout(() => {
        sendTimersRef.current.delete(clientMessageId);
        markFailed(clientMessageId);
      }, 8_000),
    );
  }

  return (
    <div className="font-pretendard flex min-h-dvh flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <button type="button" onClick={() => router.push("/app/chat")} className="grid size-9 place-items-center rounded-lg hover:bg-[#f5f5f5]" aria-label="채팅 목록">
          <ArrowLeft className="size-5" />
        </button>
        <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-[#c8c8c8]")} aria-label={connected ? "실시간 연결됨" : "재연결 중"} />
        <button type="button" onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-lg hover:bg-[#f5f5f5]" aria-label="대화 정보">
          <Menu className="size-5" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {messages === null && <p className="py-20 text-center text-[14px] text-[#686868]">불러오는 중…</p>}
        {messages?.map((message) => {
          const mine = message.senderType === "BUSINESS";
          return (
            <div key={message.id} className={cn("mb-3 flex gap-2", mine ? "justify-end" : "justify-start")}>
              {!mine && (
                <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-[#dedede] bg-[#f5f5f5] text-[#b8b8b8]">
                  <UserRound className="size-4" />
                </div>
              )}
              <div className={cn("relative max-w-[78%]", mine ? "items-end" : "items-start")}>
                {!mine && <p className="mb-1 text-[12px] text-[#686868]">{room?.userNickname || "고객"}</p>}
                <button
                  type="button"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuFor(message.id);
                  }}
                  onClick={() => setMenuFor((current) => current === message.id ? null : message.id)}
                  className={cn(
                    "block rounded-xl px-4 py-3 text-left text-[15px] leading-[1.5]",
                    mine ? "bg-[#f0e9fc]" : "bg-[#f5f5f5]",
                    message.deliveryState === "failed" && "outline outline-1 outline-red-500",
                  )}
                >
                  {message.isDeleted ? "삭제된 메시지입니다." : message.body}
                </button>
                <time className="mt-1 block text-right text-[11px] text-[#8f8f8f]">{formatMessageTime(message.createdAt)}</time>
                {menuFor === message.id && (
                  <div className="absolute left-0 top-[calc(100%-28px)] z-20 w-[122px] rounded bg-white py-1 text-[13px] text-[#686868] shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
                    <button type="button" onClick={() => { setInput(`@${room?.userNickname || "고객"} `); setMenuFor(null); }} className="block w-full px-3 py-2 text-left hover:bg-[#f5f5f5]">답글 작성</button>
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(message.body); setMenuFor(null); toast.success("내용을 복사했습니다."); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f5f5]"><Copy className="size-3" />내용 복사</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-[#f0f0f0] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex h-12 items-center rounded-xl bg-[#f1f1f1] px-3">
          <Plus className="size-5 shrink-0 text-[#8f8f8f]" />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="메시지 입력"
            aria-label="메시지 입력"
            className="min-w-0 flex-1 bg-transparent px-2 text-[14px] outline-none placeholder:text-[#8f8f8f]"
          />
          <button type="button" onClick={send} disabled={!connected || !input.trim()} className="rounded-lg bg-[#9c6cf2] px-3 py-1.5 text-[13px] text-white disabled:hidden">전송</button>
        </div>
      </div>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-full sm:max-w-[430px]">
          <SheetHeader>
            <SheetTitle>채팅방 정보</SheetTitle>
            <SheetDescription>대화상대 (2명)</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4">
            <Participant
              name={admin?.business?.name ?? admin?.name ?? "업체 관리자"}
              mine
            />
            <Participant name={room?.userNickname || "고객"} />
          </div>
          <button
            type="button"
            onClick={() => router.push("/app/chat")}
            className="absolute bottom-6 left-4 right-4 h-12 rounded-xl border border-[#dedede] text-[14px] text-[#686868]"
          >
            채팅방 나가기
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
function Participant({ name, mine = false }: { name: string; mine?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[16px]">
      <div className="grid size-8 place-items-center rounded-full border border-[#dedede] bg-[#f5f5f5] text-[#b8b8b8]"><UserRound className="size-5" /></div>
      <span>{name}</span>
      {mine && <span className="grid size-5 place-items-center rounded-full bg-[#7144c2] text-[11px] text-white">나</span>}
    </div>
  );
}

function normalizeMessage(raw: Record<string, unknown>, roomId: string): BusinessOperatorMessage {
  const roomSeq = Number(raw.roomSeq ?? raw.seq ?? 0);
  const senderType = raw.senderType === "BUSINESS" || raw.senderType === "SYSTEM" ? raw.senderType : "USER";
  return {
    id: String(raw.id ?? raw.messageId ?? `seq:${roomSeq}`),
    roomSeq,
    roomId,
    senderType,
    senderId: typeof raw.senderId === "string" ? raw.senderId : null,
    senderNickname: typeof raw.senderNickname === "string" ? raw.senderNickname : null,
    senderProfileImage: typeof raw.senderProfileImage === "string" ? raw.senderProfileImage : null,
    senderIsBusinessAdmin: senderType === "BUSINESS",
    body: typeof raw.body === "string" ? raw.body : typeof raw.content === "string" ? raw.content : "",
    type: raw.type === "IMAGE" || raw.type === "VIDEO" ? raw.type : "TEXT",
    mediaUrl: typeof raw.mediaUrl === "string" ? raw.mediaUrl : null,
    thumbnailUrl: typeof raw.thumbnailUrl === "string" ? raw.thumbnailUrl : null,
    clientMessageId: typeof raw.clientMessageId === "string" ? raw.clientMessageId : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    deliveryState: "committed",
    isDeleted: raw.isDeleted === true,
  };
}

function formatMessageTime(value: string): string {
  return formatClockTime(value);
}
