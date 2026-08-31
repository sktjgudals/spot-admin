"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Menu, RefreshCw, UserRound } from "lucide-react";
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
  getBusinessOperatorRoom,
  issueAdminChatGatewayTicket,
  listBusinessOperatorMessages,
  markBusinessOperatorRoomRead,
  type BusinessOperatorMessage,
} from "@/auth/api/admin-chat.api";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { uuidV7 } from "@/lib/uuid-v7";
import { cn } from "@/lib/utils";
import { formatClockTime } from "@/lib/format-date";
import { DopaMediaImage } from "@/components/ui/dopa-media-image";

export const CHAT_MESSAGE_WINDOW_SIZE = 200;
const CHAT_KNOWN_MESSAGE_ID_LIMIT = CHAT_MESSAGE_WINDOW_SIZE * 2;

export function BusinessMobileChatRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { admin } = useAdminAuth();
  const roomQuery = useQuery({
    queryKey: businessChatQueryKeys.room(roomId),
    queryFn: () => getBusinessOperatorRoom(roomId),
    staleTime: 60_000,
  });
  const room = roomQuery.data ?? null;
  const [messages, setMessages] = useState<BusinessOperatorMessage[] | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyReadyFor, setHistoryReadyFor] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<{
    id: string;
    roomId: string;
    text: string;
  } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<BusinessOperatorMessage[] | null>(null);
  const hasNewerRef = useRef(false);
  const knownCommittedMessageIdsRef = useRef(new Set<string>());
  const contiguousSeqRef = useRef(0);
  const observedSeqsRef = useRef(new Set<number>());
  const ackRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const scrollModeRef = useRef<"bottom" | "preserve" | null>(null);
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const historyFocusFallbackRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReadSeqRef = useRef(0);
  const sendTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const focusOldestAfterLoadRef = useRef(false);
  const focusNewestAfterLoadRef = useRef(false);

  const replaceMessages = useCallback(
    (next: BusinessOperatorMessage[] | null) => {
      messagesRef.current = next;
      setMessages(next);
    },
    [],
  );

  const setNewerAvailable = useCallback((next: boolean) => {
    hasNewerRef.current = next;
    if (next && readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
      pendingReadSeqRef.current = 0;
    }
    setHasNewer(next);
  }, []);

  const flushRead = useCallback(() => {
    readTimerRef.current = null;
    const seq = pendingReadSeqRef.current;
    if (
      seq <= 0 ||
      hasNewerRef.current ||
      document.visibilityState !== "visible" ||
      !isNearBottom(scrollContainerRef.current)
    ) return;
    pendingReadSeqRef.current = 0;
    void markBusinessOperatorRoomRead(roomId, seq).catch(() => undefined);
  }, [roomId]);

  const scheduleRead = useCallback(
    (seq: number) => {
      if (
        !Number.isSafeInteger(seq) ||
        seq <= 0 ||
        hasNewerRef.current
      ) return;
      pendingReadSeqRef.current = Math.max(pendingReadSeqRef.current, seq);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
      if (
        document.visibilityState !== "visible" ||
        !isNearBottom(scrollContainerRef.current)
      ) return;
      readTimerRef.current = setTimeout(flushRead, 400);
    },
    [flushRead],
  );

  const mergeCommittedMessages = useCallback((incoming: BusinessOperatorMessage[]) => {
    const committed = incoming.filter(
      (message) => Number.isSafeInteger(message.roomSeq) && message.roomSeq > 0,
    );
    if (committed.length === 0) return;
    if (isNearBottom(scrollContainerRef.current)) {
      scrollModeRef.current = "bottom";
    }
    if (hasNewerRef.current) {
      setNewerAvailable(true);
    } else {
      const window = mergeBusinessMessageWindow(
        "newest",
        messagesRef.current ?? [],
        committed,
      );
      replaceMessages(window.messages);
      if (window.trimmedOlder) setHasOlder(true);
    }
    for (const message of committed) {
      rememberCommittedMessageIds(knownCommittedMessageIdsRef.current, [message]);
      if (message.clientMessageId) {
        const timer = sendTimersRef.current.get(message.clientMessageId);
        if (timer) {
          clearTimeout(timer);
          sendTimersRef.current.delete(message.clientMessageId);
        }
      }
      if (message.roomSeq > contiguousSeqRef.current) {
        observedSeqsRef.current.add(message.roomSeq);
      }
    }
    while (observedSeqsRef.current.delete(contiguousSeqRef.current + 1)) {
      contiguousSeqRef.current += 1;
    }
    if (!hasNewerRef.current) scheduleRead(contiguousSeqRef.current);
  }, [replaceMessages, scheduleRead, setNewerAvailable]);

  useEffect(() => {
    let cancelled = false;
    contiguousSeqRef.current = 0;
    observedSeqsRef.current.clear();
    knownCommittedMessageIdsRef.current.clear();
    pendingReadSeqRef.current = 0;
    hasNewerRef.current = false;
    void listBusinessOperatorMessages(roomId)
      .then((page) => {
        if (cancelled) return;
        setMessagesError(null);
        setNewerAvailable(false);
        const ordered = [...page.messages].sort((a, b) => a.roomSeq - b.roomSeq);
        const window = mergeBusinessMessageWindow("newest", ordered);
        setHasOlder(page.hasMore || window.trimmedOlder);
        rememberCommittedMessageIds(knownCommittedMessageIdsRef.current, ordered);
        contiguousSeqRef.current = ordered.reduce(
          (highest, message) =>
            Number.isSafeInteger(message.roomSeq) && message.roomSeq > highest
              ? message.roomSeq
              : highest,
          0,
        );
        scrollModeRef.current = "bottom";
        replaceMessages(window.messages);
        setHistoryReadyFor(roomId);
      })
      .catch((error) => {
        if (!cancelled) {
          setNewerAvailable(false);
          replaceMessages(messagesRef.current ?? []);
          const message = error instanceof Error ? error.message : "메시지를 불러오지 못했습니다.";
          setMessagesError(message);
          setHistoryReadyFor(null);
          toast.error(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, replaceMessages, roomId, setNewerAvailable]);

  useEffect(() => {
    if (historyReadyFor !== roomId) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let catchUpRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let catchUpTask: Promise<void> | null = null;
    let requestedTail = contiguousSeqRef.current;
    let catchUpAttempt = 0;
    let attempt = 0;

    const scheduleCatchUpRetry = () => {
      if (cancelled || catchUpRetryTimer || requestedTail <= contiguousSeqRef.current) return;
      const delay = Math.min(30_000, 1_000 * 2 ** catchUpAttempt);
      catchUpAttempt += 1;
      catchUpRetryTimer = setTimeout(() => {
        catchUpRetryTimer = null;
        catchUpTo(requestedTail);
      }, delay);
    };

    const catchUpTo = (tail: number) => {
      if (!Number.isSafeInteger(tail) || tail <= 0) return;
      requestedTail = Math.max(requestedTail, tail);
      if (requestedTail <= contiguousSeqRef.current || catchUpTask) return;
      if (catchUpRetryTimer) {
        clearTimeout(catchUpRetryTimer);
        catchUpRetryTimer = null;
      }
      catchUpTask = (async () => {
        while (!cancelled && contiguousSeqRef.current < requestedTail) {
          const afterSeq = contiguousSeqRef.current;
          const targetAtRequest = requestedTail;
          const page = await listBusinessOperatorMessages(roomId, {
            afterSeq,
            limit: 100,
          });
          if (cancelled) return;
          if (page.messages.length === 0 && !page.hasMore) {
            // The operator endpoint applies its private clearedBeforeSeq floor
            // before reading. An empty terminal page therefore confirms that
            // this request's tail has no operator-visible gap to recover.
            contiguousSeqRef.current = Math.max(
              contiguousSeqRef.current,
              targetAtRequest,
            );
            for (const sequence of observedSeqsRef.current) {
              if (sequence <= contiguousSeqRef.current) {
                observedSeqsRef.current.delete(sequence);
              }
            }
            scheduleRead(contiguousSeqRef.current);
            continue;
          }
          const firstVisibleSequence = page.messages.reduce(
            (lowest, message) =>
              Number.isSafeInteger(message.roomSeq) && message.roomSeq > 0
                ? Math.min(lowest, message.roomSeq)
                : lowest,
            Number.POSITIVE_INFINITY,
          );
          if (firstVisibleSequence > contiguousSeqRef.current + 1) {
            // The operator history endpoint has already applied its private
            // clearedBeforeSeq floor. A jump at the beginning of an ascending
            // page is therefore an inaccessible prefix, not a transport gap.
            contiguousSeqRef.current = firstVisibleSequence - 1;
          }
          mergeCommittedMessages(page.messages);
          if (contiguousSeqRef.current <= afterSeq) return;
          if (!page.hasMore && contiguousSeqRef.current < requestedTail) return;
        }
        catchUpAttempt = 0;
      })()
        .catch(() => undefined)
        .finally(() => {
          catchUpTask = null;
          if (requestedTail > contiguousSeqRef.current) scheduleCatchUpRetry();
        });
    };

    const handleServerTail = (record: Record<string, unknown> | undefined) => {
      if (!record) return;
      if (typeof record.roomId === "string" && record.roomId !== roomId) return;
      const tail = Number(record.serverTailRoomSeq ?? record.roomSeq);
      catchUpTo(tail);
    };

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
            const frame = JSON.parse(event.data) as {
              type?: string;
              ok?: boolean;
              data?: Record<string, unknown>;
              payload?: Record<string, unknown>;
            };
            if (frame.type === "chat:message-committed" && frame.payload) {
              if (
                typeof frame.payload.roomId === "string" &&
                frame.payload.roomId !== roomId
              ) return;
              const message = normalizeMessage(frame.payload, roomId);
              const shouldAnnounce =
                message.senderType === "USER" &&
                !knownCommittedMessageIdsRef.current.has(message.id);
              mergeCommittedMessages([message]);
              if (shouldAnnounce) {
                const sender = message.senderNickname || "고객";
                const content = message.isDeleted
                  ? "삭제된 메시지"
                  : message.body ||
                    (message.type === "TEXT" ? "내용 없는 메시지" : "미디어 메시지");
                setLiveAnnouncement({
                  id: message.id,
                  roomId,
                  text: `${sender}: ${content}`,
                });
              }
              catchUpTo(message.roomSeq);
            } else if (frame.type === "chat:watermark") {
              handleServerTail(frame.payload);
            } else if ((frame.type === "ack" || frame.type === "chat:ack") && frame.ok !== false) {
              handleServerTail(frame.data ?? frame.payload);
            }
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
      if (catchUpRetryTimer) clearTimeout(catchUpRetryTimer);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      flushRead();
      for (const timer of sendTimers.values()) clearTimeout(timer);
      sendTimers.clear();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [flushRead, historyReadyFor, mergeCommittedMessages, roomId, scheduleRead]);

  useEffect(() => {
    const resumeReadIfEligible = () => {
      scheduleRead(contiguousSeqRef.current);
    };
    document.addEventListener("visibilitychange", resumeReadIfEligible);
    return () => document.removeEventListener("visibilitychange", resumeReadIfEligible);
  }, [scheduleRead]);

  useLayoutEffect(() => {
    const mode = scrollModeRef.current;
    const container = scrollContainerRef.current;
    if (messages === null) return;
    if (
      !mode &&
      !focusOldestAfterLoadRef.current &&
      !focusNewestAfterLoadRef.current
    ) return;
    if (mode === "preserve" && container && scrollAnchorRef.current) {
      const anchor = scrollAnchorRef.current;
      container.scrollTop = anchor.top + (container.scrollHeight - anchor.height);
    } else if (mode === "bottom") {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      scheduleRead(contiguousSeqRef.current);
    }
    if (focusOldestAfterLoadRef.current) {
      const oldestMessage = messages.at(0);
      const focusTarget = oldestMessage
        ? menuTriggerRefs.current.get(oldestMessage.id)
        : historyFocusFallbackRef.current;
      focusTarget?.focus();
      focusOldestAfterLoadRef.current = false;
    }
    if (focusNewestAfterLoadRef.current) {
      const newestMessage = messages.at(-1);
      if (newestMessage) {
        menuTriggerRefs.current.get(newestMessage.id)?.focus();
      }
      focusNewestAfterLoadRef.current = false;
    }
    scrollModeRef.current = null;
    scrollAnchorRef.current = null;
  }, [messages, scheduleRead]);

  useEffect(() => {
    if (menuFor) {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    }
  }, [menuFor]);

  function markFailed(clientMessageId: string) {
    replaceMessages(
      (messagesRef.current ?? []).map((item) =>
        item.clientMessageId === clientMessageId && item.deliveryState === "pending"
          ? { ...item, deliveryState: "failed" }
          : item,
      ),
    );
  }

  async function loadOlderMessages() {
    const beforeSeq = earliestCommittedSequence(messagesRef.current ?? []);
    if (!beforeSeq || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listBusinessOperatorMessages(roomId, { beforeSeq, limit: 100 });
      const container = scrollContainerRef.current;
      if (container) {
        scrollAnchorRef.current = {
          height: container.scrollHeight,
          top: container.scrollTop,
        };
        scrollModeRef.current = "preserve";
      }
      const window = mergeBusinessMessageWindow(
        "oldest",
        page.messages,
        messagesRef.current ?? [],
      );
      rememberCommittedMessageIds(
        knownCommittedMessageIdsRef.current,
        page.messages,
      );
      if (!page.hasMore) focusOldestAfterLoadRef.current = true;
      replaceMessages(window.messages);
      setHasOlder(page.hasMore);
      if (window.trimmedNewer) setNewerAvailable(true);
    } catch (error) {
      scrollModeRef.current = null;
      scrollAnchorRef.current = null;
      toast.error(
        error instanceof Error ? error.message : "이전 메시지를 불러오지 못했습니다.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function loadNewerMessages() {
    const afterSeq = latestCommittedSequence(messagesRef.current ?? []);
    if (!afterSeq || loadingNewer) return;
    setLoadingNewer(true);
    try {
      const page = await listBusinessOperatorMessages(roomId, {
        afterSeq,
        limit: 100,
      });
      const window = mergeBusinessMessageWindow(
        "newest",
        messagesRef.current ?? [],
        page.messages,
      );
      rememberCommittedMessageIds(
        knownCommittedMessageIdsRef.current,
        page.messages,
      );
      replaceMessages(window.messages);
      if (window.trimmedOlder) setHasOlder(true);
      const newestLoadedSequence = latestCommittedSequence(window.messages) ?? 0;
      const moreNewerMessages =
        page.hasMore || newestLoadedSequence < contiguousSeqRef.current;
      setNewerAvailable(moreNewerMessages);
      if (!moreNewerMessages) {
        scrollModeRef.current = "bottom";
        focusNewestAfterLoadRef.current = true;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "최신 메시지를 불러오지 못했습니다.",
      );
    } finally {
      setLoadingNewer(false);
    }
  }

  function retryMessage(message: BusinessOperatorMessage) {
    const socket = socketRef.current;
    if (
      !message.clientMessageId ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      toast.error("연결이 복구되면 다시 보낼 수 있습니다.");
      return;
    }
    replaceMessages(
      (messagesRef.current ?? []).map((item) =>
        item.id === message.id ? { ...item, deliveryState: "pending" } : item,
      ),
    );
    socket.send(
      JSON.stringify({
        type: "chat:send",
        ackId: `web-${++ackRef.current}`,
        payload: {
          roomId,
          content: message.body,
          clientMessageId: message.clientMessageId,
          clientCreatedAt: message.createdAt,
          type: "TEXT",
        },
      }),
    );
    const existingTimer = sendTimersRef.current.get(message.clientMessageId);
    if (existingTimer) clearTimeout(existingTimer);
    sendTimersRef.current.set(
      message.clientMessageId,
      setTimeout(() => {
        sendTimersRef.current.delete(message.clientMessageId as string);
        markFailed(message.clientMessageId as string);
      }, 8_000),
    );
  }

  function send(draft: string) {
    const body = draft.trim();
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
    scrollModeRef.current = "bottom";
    const window = mergeBusinessMessageWindow(
      "newest",
      messagesRef.current ?? [],
      [optimistic],
    );
    replaceMessages(window.messages);
    if (window.trimmedOlder) setHasOlder(true);
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

  function restoreMenuTrigger(messageId: string) {
    setMenuFor(null);
    menuTriggerRefs.current.get(messageId)?.focus();
  }

  function handleMenuKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    messageId: string,
  ) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
    );
    if (event.key === "Escape") {
      event.preventDefault();
      restoreMenuTrigger(messageId);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-pretendard">
      <header className="mx-auto flex h-14 w-full max-w-5xl shrink-0 items-center justify-between border-b px-4 sm:px-6">
        <button type="button" onClick={() => router.push("/app/chat")} className="grid size-11 place-items-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring" aria-label="채팅 목록">
          <ArrowLeft className="size-5" />
        </button>
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground")} aria-hidden />
          {connected ? "실시간 연결됨" : "재연결 중"}
        </p>
        <button type="button" onClick={() => setDrawer(true)} className="grid size-11 place-items-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring" aria-label="대화 정보">
          <Menu className="size-5" />
        </button>
      </header>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-chat-live-announcement
      >
        {liveAnnouncement?.roomId === roomId ? (
          <span key={liveAnnouncement.id}>{liveAnnouncement.text}</span>
        ) : null}
      </div>

      <main
        ref={scrollContainerRef}
        onScroll={() => scheduleRead(contiguousSeqRef.current)}
        className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 pb-28 pt-4 sm:px-6"
      >
        {messages === null && (
          <div className="space-y-3 py-8" aria-label="메시지를 불러오는 중" aria-busy="true">
            <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-muted" />
            <div className="ml-auto h-16 w-1/2 animate-pulse rounded-2xl bg-secondary" />
            <div className="h-20 w-3/4 animate-pulse rounded-2xl bg-muted" />
          </div>
        )}
        {messagesError ? (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <div>
              <p className="font-medium text-destructive">메시지를 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">{messagesError}</p>
              <button
                type="button"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                onClick={() => {
                  replaceMessages(null);
                  setMessagesError(null);
                  setHistoryReadyFor(null);
                  setReloadKey((value) => value + 1);
                }}
              >
                <RefreshCw className="size-4" /> 다시 시도
              </button>
            </div>
          </div>
        ) : null}
        {messages?.length === 0 && !messagesError ? (
          <div
            ref={historyFocusFallbackRef}
            tabIndex={-1}
            className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-muted/20 text-center text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            아직 메시지가 없습니다.
          </div>
        ) : null}
        {hasOlder && !messagesError ? (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => void loadOlderMessages()}
              className="min-h-11 rounded-xl border bg-background px-4 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
            >
              {loadingOlder ? "불러오는 중…" : "이전 메시지 불러오기"}
            </button>
          </div>
        ) : null}
        {messages?.map((message) => {
          const mine = message.senderType === "BUSINESS";
          const mediaUrl = safeMediaUrl(message.mediaUrl);
          return (
            <div
              key={message.id}
              data-chat-message
              className={cn("mb-3 flex gap-2 [contain-intrinsic-size:72px] [content-visibility:auto]", mine ? "justify-end" : "justify-start")}
            >
              {!mine && (
                <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </div>
              )}
              <div className={cn("relative max-w-[78%]", mine ? "items-end" : "items-start")}>
                {!mine && <p className="mb-1 text-xs text-muted-foreground">{room?.title || message.senderNickname || "고객"}</p>}
                {!message.isDeleted && message.type === "IMAGE" && mediaUrl ? (
                  <DopaMediaImage
                    src={mediaUrl}
                    transformWidth={800}
                    alt={message.body || "이미지 메시지"}
                    className="mb-1 max-h-80 w-full rounded-xl border bg-muted object-contain"
                  />
                ) : null}
                {!message.isDeleted && message.type === "VIDEO" && mediaUrl ? (
                  <video
                    src={mediaUrl}
                    poster={safeMediaUrl(message.thumbnailUrl) ?? undefined}
                    aria-label={message.body || "동영상 메시지"}
                    className="mb-1 max-h-80 w-full rounded-xl border bg-black"
                    controls
                    preload="metadata"
                  />
                ) : null}
                <button
                  ref={(node) => {
                    if (node) menuTriggerRefs.current.set(message.id, node);
                    else menuTriggerRefs.current.delete(message.id);
                  }}
                  type="button"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuFor(message.id);
                  }}
                  onClick={() => setMenuFor((current) => current === message.id ? null : message.id)}
                  aria-expanded={menuFor === message.id}
                  aria-haspopup="menu"
                  aria-controls={menuFor === message.id ? `message-menu-${message.id}` : undefined}
                  className={cn(
                    "block min-h-11 rounded-xl px-4 py-3 text-left text-[15px] leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring",
                    mine ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground",
                    message.deliveryState === "failed" && "ring-1 ring-destructive",
                  )}
                >
                  {message.isDeleted
                    ? "삭제된 메시지입니다."
                    : message.body ||
                      (message.type === "TEXT" ? "내용 없는 메시지" : "미디어 메시지")}
                </button>
                <time className="mt-1 block text-right text-xs text-muted-foreground">{formatMessageTime(message.createdAt)}</time>
                {message.deliveryState === "failed" ? (
                  <div
                    role="alert"
                    className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs text-destructive"
                  >
                    <span>전송에 실패했습니다.</span>
                    <button
                      type="button"
                      disabled={!connected}
                      aria-label="메시지 다시 보내기"
                      onClick={() => retryMessage(message)}
                      className="min-h-8 rounded-lg border border-destructive/30 px-2 font-medium outline-none hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      다시 보내기
                    </button>
                  </div>
                ) : null}
                {menuFor === message.id && (
                  <div
                    ref={menuRef}
                    id={`message-menu-${message.id}`}
                    className="absolute left-0 top-[calc(100%-28px)] z-20 w-40 rounded-xl border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
                    role="menu"
                    aria-label="메시지 작업"
                    onKeyDown={(event) => handleMenuKeyDown(event, message.id)}
                  >
                    <button type="button" role="menuitem" onClick={() => { composerRef.current?.prefill(`@${room?.title || message.senderNickname || "고객"} `); setMenuFor(null); }} className="block min-h-11 w-full px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted">멘션하여 작성</button>
                    <button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(message.body); setMenuFor(null); toast.success("내용을 복사했습니다."); }} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"><Copy className="size-3" />내용 복사</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {hasNewer && !messagesError ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              disabled={loadingNewer}
              onClick={() => void loadNewerMessages()}
              className="min-h-11 rounded-xl border bg-background px-4 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
            >
              {loadingNewer ? "불러오는 중…" : "최신 메시지 불러오기"}
            </button>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </main>

      <ChatComposer
        ref={composerRef}
        connected={connected}
        atLiveTail={!hasNewer}
        onSend={send}
      />

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
            <Participant name={room?.title || "고객"} />
          </div>
          <button
            type="button"
            onClick={() => router.push("/app/chat")}
            className="absolute bottom-6 left-4 right-4 min-h-12 rounded-xl border text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            채팅 목록으로 돌아가기
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type ChatComposerHandle = {
  prefill: (value: string) => void;
};

const ChatComposer = forwardRef<
  ChatComposerHandle,
  {
    connected: boolean;
    atLiveTail: boolean;
    onSend: (draft: string) => void;
  }
>(function ChatComposer({ connected, atLiveTail, onSend }, ref) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      prefill(value: string) {
        setDraft(value);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      },
    }),
    [],
  );

  const submit = () => {
    if (!connected || !atLiveTail || !draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <form
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-5xl border-t bg-background/95 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex min-h-12 items-center rounded-xl border bg-muted/50 px-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="메시지 입력"
          aria-label="메시지 입력"
          aria-describedby="chat-connection-status"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <span id="chat-connection-status" className="sr-only">
          {!atLiveTail
            ? "최신 메시지를 불러온 뒤 전송 가능"
            : connected
              ? "전송 가능"
              : "연결 복구 후 전송 가능"}
        </span>
        <button
          type="submit"
          disabled={!connected || !atLiveTail || !draft.trim()}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
        >
          전송
        </button>
      </div>
    </form>
  );
});

export function mergeBusinessMessages(
  ...groups: readonly BusinessOperatorMessage[][]
): BusinessOperatorMessage[] {
  const merged: BusinessOperatorMessage[] = [];
  const indexById = new Map<string, number>();
  const indexByClientMessageId = new Map<string, number>();
  for (const message of groups.flat()) {
    const duplicateIndex =
      indexById.get(message.id) ??
      (message.clientMessageId
        ? indexByClientMessageId.get(message.clientMessageId)
        : undefined);
    const targetIndex = duplicateIndex ?? merged.length;
    const previous = merged[targetIndex];
    if (previous) {
      indexById.delete(previous.id);
      if (previous.clientMessageId) indexByClientMessageId.delete(previous.clientMessageId);
      merged[targetIndex] = message;
    } else {
      merged.push(message);
    }
    indexById.set(message.id, targetIndex);
    if (message.clientMessageId) {
      indexByClientMessageId.set(message.clientMessageId, targetIndex);
    }
  }
  return merged.sort((left, right) => left.roomSeq - right.roomSeq);
}

type ChatMessageWindowAnchor = "oldest" | "newest";

export function mergeBusinessMessageWindow(
  anchor: ChatMessageWindowAnchor,
  ...groups: readonly BusinessOperatorMessage[][]
): {
  messages: BusinessOperatorMessage[];
  trimmedOlder: boolean;
  trimmedNewer: boolean;
} {
  const merged = mergeBusinessMessages(...groups);
  const overflow = Math.max(0, merged.length - CHAT_MESSAGE_WINDOW_SIZE);
  if (overflow === 0) {
    return { messages: merged, trimmedOlder: false, trimmedNewer: false };
  }
  if (anchor === "oldest") {
    return {
      messages: merged.slice(0, CHAT_MESSAGE_WINDOW_SIZE),
      trimmedOlder: false,
      trimmedNewer: true,
    };
  }
  return {
    messages: merged.slice(-CHAT_MESSAGE_WINDOW_SIZE),
    trimmedOlder: true,
    trimmedNewer: false,
  };
}

function rememberCommittedMessageIds(
  knownIds: Set<string>,
  messages: readonly BusinessOperatorMessage[],
): void {
  for (const message of messages) {
    knownIds.delete(message.id);
    knownIds.add(message.id);
  }
  while (knownIds.size > CHAT_KNOWN_MESSAGE_ID_LIMIT) {
    const oldestId = knownIds.values().next().value;
    if (typeof oldestId !== "string") break;
    knownIds.delete(oldestId);
  }
}

function earliestCommittedSequence(
  messages: readonly BusinessOperatorMessage[],
): number | undefined {
  let earliest: number | undefined;
  for (const message of messages) {
    if (!isCommittedSequence(message)) continue;
    earliest = earliest === undefined
      ? message.roomSeq
      : Math.min(earliest, message.roomSeq);
  }
  return earliest;
}

function latestCommittedSequence(
  messages: readonly BusinessOperatorMessage[],
): number | undefined {
  let latest: number | undefined;
  for (const message of messages) {
    if (!isCommittedSequence(message)) continue;
    latest = latest === undefined
      ? message.roomSeq
      : Math.max(latest, message.roomSeq);
  }
  return latest;
}

function isCommittedSequence(message: BusinessOperatorMessage): boolean {
  return (
    message.deliveryState === "committed" &&
    Number.isSafeInteger(message.roomSeq) &&
    message.roomSeq > 0 &&
    message.roomSeq < Number.MAX_SAFE_INTEGER
  );
}

function safeMediaUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowedHosts = new Set(["media.dopa.ing", "media-staging.dopa.ing"]);
    return url.protocol === "https:" &&
      allowedHosts.has(url.hostname) &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function isNearBottom(container: HTMLElement | null): boolean {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight < 96;
}
function Participant({ name, mine = false }: { name: string; mine?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[16px]">
      <div className="grid size-8 place-items-center rounded-full border bg-muted text-muted-foreground"><UserRound className="size-5" /></div>
      <span>{name}</span>
      {mine && <span className="grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">나</span>}
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
