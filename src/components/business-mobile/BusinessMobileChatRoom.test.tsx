import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessOperatorMessage } from "@/auth/api/admin-chat.api";

const mocks = vi.hoisted(() => ({
  listMessages: vi.fn(),
  listRooms: vi.fn(),
  getRoom: vi.fn(),
  issueTicket: vi.fn(),
  markRead: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    admin: { name: "운영자", business: { name: "도파 라운지" } },
  }),
}));

vi.mock("@/auth/api/admin-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-chat.api")>();
  return {
    ...actual,
    adminChatGatewayUrl: () => "ws://example.test/chat",
    issueAdminChatGatewayTicket: mocks.issueTicket,
    listBusinessOperatorMessages: mocks.listMessages,
    listBusinessOperatorRooms: mocks.listRooms,
    getBusinessOperatorRoom: mocks.getRoom,
    markBusinessOperatorRoomRead: mocks.markRead,
  };
});

import {
  BusinessMobileChatRoom,
  CHAT_MESSAGE_WINDOW_SIZE,
  mergeBusinessMessages,
  mergeBusinessMessageWindow,
} from "./BusinessMobileChatRoom";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(String(data));
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(frame: Record<string, unknown>) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(frame) }),
    );
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }
}

function chatMessage(
  overrides: Partial<BusinessOperatorMessage> = {},
): BusinessOperatorMessage {
  return {
    id: "message-1",
    roomSeq: 1,
    roomId: "room-1",
    senderType: "USER",
    senderId: "user-1",
    senderNickname: "고객",
    senderProfileImage: null,
    senderIsBusinessAdmin: false,
    body: "안녕하세요",
    type: "TEXT",
    mediaUrl: null,
    thumbnailUrl: null,
    clientMessageId: null,
    createdAt: "2026-08-31T01:00:00.000Z",
    deliveryState: "committed",
    ...overrides,
  };
}

function renderRoom() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BusinessMobileChatRoom roomId="room-1" />
    </QueryClientProvider>,
  );
}

describe("BusinessMobileChatRoom", () => {
  beforeEach(() => {
    mocks.listMessages.mockReset();
    mocks.listRooms.mockReset();
    mocks.getRoom.mockReset();
    mocks.issueTicket.mockReset();
    mocks.markRead.mockReset();
    mocks.push.mockReset();
    mocks.listRooms.mockResolvedValue([
      {
        id: "room-1",
        userId: "user-1",
        userNickname: "고객",
        userProfileImage: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        unreadCount: 0,
        assignedAdminId: null,
        assignedAdminName: null,
      },
    ]);
    mocks.getRoom.mockResolvedValue({
      id: "room-1",
      title: "고객",
      imageUrl: null,
      otherUserId: "user-1",
      unreadCount: 0,
    });
    mocks.issueTicket.mockImplementation(() => new Promise(() => undefined));
    mocks.markRead.mockResolvedValue({ ok: true, businessLastReadSeq: 1 });
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("merges delayed history without erasing a message received earlier", () => {
    const history = chatMessage({ id: "history", roomSeq: 1, body: "기존 메시지" });
    const live = chatMessage({ id: "live", roomSeq: 2, body: "실시간 메시지" });

    expect(mergeBusinessMessages([history], [live]).map(({ id }) => id)).toEqual([
      "history",
      "live",
    ]);
  });

  it("caps sorted message windows while preserving the requested history edge", () => {
    const history = Array.from(
      { length: CHAT_MESSAGE_WINDOW_SIZE + 20 },
      (_, index) =>
        chatMessage({
          id: `message-${index + 1}`,
          roomSeq: index + 1,
          body: `메시지 ${index + 1}`,
        }),
    );

    const newest = mergeBusinessMessageWindow("newest", history);
    expect(newest.messages).toHaveLength(CHAT_MESSAGE_WINDOW_SIZE);
    expect(newest.messages[0]?.roomSeq).toBe(21);
    expect(newest.messages.at(-1)?.roomSeq).toBe(
      CHAT_MESSAGE_WINDOW_SIZE + 20,
    );
    expect(newest.trimmedOlder).toBe(true);
    expect(newest.trimmedNewer).toBe(false);

    const oldest = mergeBusinessMessageWindow("oldest", history);
    expect(oldest.messages).toHaveLength(CHAT_MESSAGE_WINDOW_SIZE);
    expect(oldest.messages[0]?.roomSeq).toBe(1);
    expect(oldest.messages.at(-1)?.roomSeq).toBe(CHAT_MESSAGE_WINDOW_SIZE);
    expect(oldest.trimmedOlder).toBe(false);
    expect(oldest.trimmedNewer).toBe(true);
  });

  it("fetches only the active room instead of polling the whole inbox", async () => {
    mocks.listMessages.mockResolvedValue({ messages: [], hasMore: false });
    renderRoom();

    expect(await screen.findByText("아직 메시지가 없습니다.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getRoom).toHaveBeenCalledWith("room-1"));
    expect(mocks.listRooms).not.toHaveBeenCalled();
  });

  it("announces only a newly received live message, not the initial history", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [chatMessage({ body: "기존 대화" })],
      hasMore: false,
    });
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    const { container } = renderRoom();

    await screen.findByRole("button", { name: "기존 대화" });
    const liveRegion = container.querySelector("[data-chat-live-announcement]");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toBeEmptyDOMElement();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    act(() => socket.open());
    act(() =>
      socket.receive({
        type: "chat:message-committed",
        payload: {
          id: "message-2",
          roomId: "room-1",
          roomSeq: 2,
          senderType: "USER",
          senderNickname: "고객",
          content: "새 문의가 도착했습니다",
          createdAt: "2026-08-31T01:02:00.000Z",
        },
      }),
    );

    await waitFor(() =>
      expect(liveRegion).toHaveTextContent("고객: 새 문의가 도착했습니다"),
    );
  });

  it("waits for initial REST history before joining and catches up to an ack tail page by page", async () => {
    let resolveInitial!: (page: {
      messages: BusinessOperatorMessage[];
      hasMore: boolean;
    }) => void;
    mocks.listMessages
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          }),
      )
      .mockResolvedValueOnce({
        messages: [chatMessage({ id: "message-2", roomSeq: 2, body: "두 번째" })],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        messages: [chatMessage({ id: "message-3", roomSeq: 3, body: "세 번째" })],
        hasMore: false,
      });
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    renderRoom();

    await waitFor(() => expect(mocks.listMessages).toHaveBeenCalledTimes(1));
    expect(mocks.issueTicket).not.toHaveBeenCalled();

    await act(async () => {
      resolveInitial({ messages: [chatMessage()], hasMore: false });
    });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    act(() => socket.open());
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({
      type: "chat:join",
      payload: { roomId: "room-1", generation: 1 },
    });

    act(() =>
      socket.receive({
        type: "ack",
        ackId: "web-1",
        ok: true,
        data: { roomId: "room-1", serverTailRoomSeq: 3 },
      }),
    );

    expect(await screen.findByText("세 번째")).toBeInTheDocument();
    expect(mocks.listMessages).toHaveBeenNthCalledWith(2, "room-1", {
      afterSeq: 1,
      limit: 100,
    });
    expect(mocks.listMessages).toHaveBeenNthCalledWith(3, "room-1", {
      afterSeq: 2,
      limit: 100,
    });
  });

  it("fills an out-of-order live gap before advancing the read cursor", async () => {
    let resolveGap!: (page: {
      messages: BusinessOperatorMessage[];
      hasMore: boolean;
    }) => void;
    mocks.listMessages
      .mockResolvedValueOnce({ messages: [chatMessage()], hasMore: false })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveGap = resolve;
          }),
      );
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    renderRoom();
    await screen.findByText("안녕하세요");
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    act(() => socket.open());
    mocks.markRead.mockClear();

    act(() =>
      socket.receive({
        type: "chat:message-committed",
        payload: {
          id: "message-3",
          roomId: "room-1",
          roomSeq: 3,
          senderType: "USER",
          content: "세 번째",
          createdAt: "2026-08-31T01:02:00.000Z",
        },
      }),
    );
    await waitFor(() =>
      expect(mocks.listMessages).toHaveBeenLastCalledWith("room-1", {
        afterSeq: 1,
        limit: 100,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mocks.markRead).not.toHaveBeenCalledWith("room-1", 3);

    await act(async () => {
      resolveGap({
        messages: [
          chatMessage({ id: "message-2", roomSeq: 2, body: "두 번째" }),
          chatMessage({ id: "message-3", roomSeq: 3, body: "세 번째" }),
        ],
        hasMore: false,
      });
    });

    expect(await screen.findByText("두 번째")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.markRead).toHaveBeenLastCalledWith("room-1", 3),
    );
  });

  it("uses a reconnect watermark to recover messages missed while disconnected", async () => {
    mocks.listMessages
      .mockResolvedValueOnce({ messages: [chatMessage()], hasMore: false })
      .mockResolvedValueOnce({
        messages: [chatMessage({ id: "message-2", roomSeq: 2, body: "재연결 복구" })],
        hasMore: false,
      });
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    renderRoom();
    await screen.findByText("안녕하세요");
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const firstSocket = FakeWebSocket.instances[0]!;
    act(() => firstSocket.open());

    vi.useFakeTimers();
    act(() => firstSocket.serverClose());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    const reconnectSocket = FakeWebSocket.instances[1]!;
    act(() => reconnectSocket.open());
    await act(async () => {
      reconnectSocket.receive({
        type: "chat:watermark",
        payload: { roomId: "room-1", roomSeq: 2 },
      });
      await Promise.resolve();
    });

    expect(screen.getByText("재연결 복구")).toBeInTheDocument();
    expect(mocks.listMessages).toHaveBeenLastCalledWith("room-1", {
      afterSeq: 1,
      limit: 100,
    });
  });

  it("accepts an empty terminal catch-up page as the operator-visible cleared tail", async () => {
    mocks.listMessages
      .mockResolvedValueOnce({ messages: [], hasMore: false })
      .mockResolvedValueOnce({ messages: [], hasMore: false });
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    renderRoom();
    await screen.findByText("아직 메시지가 없습니다.");
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    act(() => socket.open());

    vi.useFakeTimers();
    await act(async () => {
      socket.receive({
        type: "chat:watermark",
        payload: { roomId: "room-1", roomSeq: 8 },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.listMessages).toHaveBeenLastCalledWith("room-1", {
      afterSeq: 0,
      limit: 100,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.listMessages).toHaveBeenCalledTimes(2);
    expect(mocks.markRead).toHaveBeenLastCalledWith("room-1", 8);
  });

  it("rebases a catch-up page across the operator-visible cleared sequence floor", async () => {
    mocks.listMessages
      .mockResolvedValueOnce({ messages: [], hasMore: false })
      .mockResolvedValueOnce({
        messages: [
          chatMessage({
            id: "message-8",
            roomSeq: 8,
            body: "기록 삭제 후 새 메시지",
          }),
        ],
        hasMore: false,
      });
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    renderRoom();
    await screen.findByText("아직 메시지가 없습니다.");
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    act(() => socket.open());

    vi.useFakeTimers();
    await act(async () => {
      socket.receive({
        type: "chat:watermark",
        payload: { roomId: "room-1", roomSeq: 8 },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("기록 삭제 후 새 메시지")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.markRead).toHaveBeenLastCalledWith("room-1", 8);
    expect(mocks.listMessages).toHaveBeenCalledTimes(2);
  });

  it("marks read only while visible and near the bottom, then resumes on scroll", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [chatMessage()],
      hasMore: false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const { container } = renderRoom();
    await screen.findByText("안녕하세요");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mocks.markRead).not.toHaveBeenCalled();

    const scroller = container.querySelector("main")!;
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mocks.markRead).not.toHaveBeenCalled();

    scroller.scrollTop = 700;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(mocks.markRead).toHaveBeenLastCalledWith("room-1", 1),
    );
  });

  it("renders media and loads older history before the earliest sequence", async () => {
    const user = userEvent.setup();
    mocks.listMessages
      .mockResolvedValueOnce({
        messages: [
          chatMessage({
            id: "image",
            roomSeq: 5,
            body: "현장 사진",
            type: "IMAGE",
            mediaUrl: "https://media.dopa.ing/chat/room-1/photo.jpg",
          }),
          chatMessage({
            id: "video",
            roomSeq: 6,
            body: "현장 영상",
            type: "VIDEO",
            mediaUrl: "https://media.dopa.ing/chat/room-1/video.mp4",
            thumbnailUrl: "https://media.dopa.ing/chat/room-1/video.jpg",
          }),
        ],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        messages: [chatMessage({ id: "older", roomSeq: 4, body: "이전 메시지" })],
        hasMore: false,
      });
    renderRoom();

    expect(await screen.findByRole("img", { name: "현장 사진" })).toHaveAttribute(
      "src",
      "https://media.dopa.ing/t/width=800,quality=72,format=webp,fit=scale-down/chat/room-1/photo.jpg",
    );
    expect(screen.getByLabelText("현장 영상")).toHaveAttribute(
      "src",
      "https://media.dopa.ing/chat/room-1/video.mp4",
    );
    const scrollCallCount = vi.mocked(Element.prototype.scrollIntoView).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "이전 메시지 불러오기" }));

    expect(await screen.findByText("이전 메시지")).toBeInTheDocument();
    const oldestMessage = screen.getByRole("button", { name: "이전 메시지" });
    await waitFor(() => expect(oldestMessage).toHaveFocus());
    expect(mocks.listMessages).toHaveBeenNthCalledWith(2, "room-1", {
      beforeSeq: 5,
      limit: 100,
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(scrollCallCount);
  });

  it("slides a bounded DOM window across older history and back to the live tail", async () => {
    const user = userEvent.setup();
    mocks.issueTicket.mockResolvedValue({
      accessToken: "socket-ticket",
      expiresAt: "2026-08-31T02:00:00.000Z",
      operatorUserId: "operator-1",
      businessId: "business-1",
    });
    const messages = (start: number, end: number) =>
      Array.from({ length: end - start + 1 }, (_, index) => {
        const sequence = start + index;
        return chatMessage({
          id: `message-${sequence}`,
          roomSeq: sequence,
          body: `메시지 ${sequence}`,
        });
      });
    mocks.listMessages
      .mockResolvedValueOnce({
        messages: messages(
          CHAT_MESSAGE_WINDOW_SIZE + 1,
          CHAT_MESSAGE_WINDOW_SIZE * 2,
        ),
        hasMore: true,
      })
      .mockResolvedValueOnce({
        messages: messages(1, CHAT_MESSAGE_WINDOW_SIZE),
        hasMore: false,
      })
      .mockResolvedValueOnce({
        messages: messages(
          CHAT_MESSAGE_WINDOW_SIZE + 1,
          CHAT_MESSAGE_WINDOW_SIZE * 2,
        ),
        hasMore: false,
      });
    const { container } = renderRoom();

    expect(
      await screen.findByRole("button", {
        name: `메시지 ${CHAT_MESSAGE_WINDOW_SIZE * 2}`,
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-chat-message]")).toHaveLength(
      CHAT_MESSAGE_WINDOW_SIZE,
    );
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    act(() => socket.open());

    await user.click(screen.getByRole("button", { name: "이전 메시지 불러오기" }));
    expect(await screen.findByRole("button", { name: "메시지 1" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: `메시지 ${CHAT_MESSAGE_WINDOW_SIZE * 2}`,
      }),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-chat-message]")).toHaveLength(
      CHAT_MESSAGE_WINDOW_SIZE,
    );
    mocks.markRead.mockClear();
    fireEvent.scroll(container.querySelector("main")!);
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mocks.markRead).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "메시지 입력" }), "운영자 답변");
    expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
    expect(screen.getByText("최신 메시지를 불러온 뒤 전송 가능")).toBeInTheDocument();
    expect(socket.sent).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "최신 메시지 불러오기" }));
    expect(
      await screen.findByRole("button", {
        name: `메시지 ${CHAT_MESSAGE_WINDOW_SIZE * 2}`,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "메시지 1" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-chat-message]")).toHaveLength(
      CHAT_MESSAGE_WINDOW_SIZE,
    );
    expect(mocks.listMessages).toHaveBeenNthCalledWith(3, "room-1", {
      afterSeq: CHAT_MESSAGE_WINDOW_SIZE,
      limit: 100,
    });
    expect(screen.getByRole("button", { name: "전송" })).toBeEnabled();
  });

  it("does not render chat media from an untrusted external origin", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [
        chatMessage({
          body: "외부 이미지",
          type: "IMAGE",
          mediaUrl: "https://tracker.example.test/pixel.jpg",
        }),
      ],
      hasMore: false,
    });
    renderRoom();

    expect(await screen.findByRole("button", { name: "외부 이미지" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "외부 이미지" })).not.toBeInTheDocument();
  });

  it("uses non-animated initial scrolling when reduced motion is requested", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    mocks.listMessages.mockResolvedValue({
      messages: [chatMessage()],
      hasMore: false,
    });
    renderRoom();

    expect(await screen.findByText("안녕하세요")).toBeInTheDocument();
    await waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({ behavior: "auto" }),
    );
  });

  it("manages message action menu focus with arrows and Escape", async () => {
    const user = userEvent.setup();
    mocks.listMessages.mockResolvedValue({
      messages: [chatMessage()],
      hasMore: false,
    });
    renderRoom();

    const trigger = await screen.findByRole("button", { name: "안녕하세요" });
    await user.click(trigger);
    const mention = screen.getByRole("menuitem", { name: "멘션하여 작성" });
    expect(mention).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "내용 복사" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("announces a failed outgoing message and exposes a retry control", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [
        chatMessage({
          id: "failed",
          senderType: "BUSINESS",
          senderIsBusinessAdmin: true,
          body: "전송할 내용",
          deliveryState: "failed",
          clientMessageId: "client-1",
        }),
      ],
      hasMore: false,
    });
    renderRoom();

    expect(await screen.findByRole("alert")).toHaveTextContent("전송에 실패했습니다.");
    expect(screen.getByRole("button", { name: "메시지 다시 보내기" })).toBeDisabled();
  });

  it("labels navigation honestly instead of claiming to leave the room", async () => {
    const user = userEvent.setup();
    mocks.listMessages.mockResolvedValue({ messages: [], hasMore: false });
    renderRoom();

    await user.click(screen.getByRole("button", { name: "대화 정보" }));
    expect(
      await screen.findByRole("button", { name: "채팅 목록으로 돌아가기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "채팅방 나가기" })).not.toBeInTheDocument();
  });
});
