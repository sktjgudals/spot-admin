import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessOperatorRoom } from "@/auth/api/admin-chat.api";

const mocks = vi.hoisted(() => ({
  listRooms: vi.fn(),
}));

vi.mock("@/auth/api/admin-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-chat.api")>();
  return {
    ...actual,
    listBusinessOperatorRooms: mocks.listRooms,
  };
});

vi.mock("@/components/business-mobile/BusinessMobileNavigation", () => ({
  BusinessBottomNav: () => <nav aria-label="하단 탐색" />,
}));

import {
  BusinessMobileChatList,
  CHAT_LIST_REFRESH_INTERVAL_MS,
  getChatListRefreshInterval,
} from "./BusinessMobileChatList";

function room(index: number): BusinessOperatorRoom {
  return {
    id: `room-${index}`,
    userId: `user-${index}`,
    userNickname: `고객 ${index}`,
    userProfileImage: null,
    lastMessageAt: "2026-09-01T01:00:00.000Z",
    lastMessagePreview: `${index}번째 문의`,
    unreadCount: index === 1 ? 3 : 0,
    assignedAdminId: null,
    assignedAdminName: null,
  };
}

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <BusinessMobileChatList />
    </QueryClientProvider>,
  );
}

describe("BusinessMobileChatList", () => {
  beforeEach(() => {
    mocks.listRooms.mockReset();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes no faster than once per minute and pauses automatic work off-screen", () => {
    expect(CHAT_LIST_REFRESH_INTERVAL_MS).toBe(60_000);
    expect(getChatListRefreshInterval()).toBe(60_000);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    expect(getChatListRefreshInterval()).toBe(false);
  });

  it("renders a bounded first window and progressively reveals the latest 100 rooms", async () => {
    mocks.listRooms.mockResolvedValue(Array.from({ length: 100 }, (_, index) => room(index + 1)));
    const user = userEvent.setup();
    renderList();

    expect((await screen.findByText("고객 1")).closest("a")).toBeInTheDocument();
    expect(screen.getByText("고객 30").closest("a")).toBeInTheDocument();
    expect(screen.queryByText("고객 31")).not.toBeInTheDocument();
    expect(screen.getByText("30 / 100개 대화 표시 중")).toBeInTheDocument();
    expect(
      screen.getByText(/서버가 제공하는 최근 100개 대화만 표시합니다/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "대화 더 보기" }));

    expect(screen.getByText("고객 60").closest("a")).toBeInTheDocument();
    expect(screen.queryByText("고객 61")).not.toBeInTheDocument();
    expect(screen.getByText("60 / 100개 대화 표시 중")).toBeInTheDocument();
  });

  it("does not claim the inbox is partial below the endpoint cap", async () => {
    mocks.listRooms.mockResolvedValue(Array.from({ length: 99 }, (_, index) => room(index + 1)));
    renderList();

    expect((await screen.findByText("고객 1")).closest("a")).toBeInTheDocument();
    expect(
      screen.queryByText(/서버가 제공하는 최근 100개 대화만 표시합니다/),
    ).not.toBeInTheDocument();
  });

  it("supports an explicit refresh without waiting for the automatic interval", async () => {
    mocks.listRooms.mockResolvedValue([]);
    const user = userEvent.setup();
    renderList();

    expect(await screen.findByText("아직 채팅 목록이 없어요.")).toBeInTheDocument();
    expect(mocks.listRooms).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "채팅 목록 새로고침" }));

    await waitFor(() => expect(mocks.listRooms).toHaveBeenCalledTimes(2));
  });

  it("does not automatically refetch while the document is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    mocks.listRooms.mockResolvedValue([]);
    renderList();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.listRooms).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHAT_LIST_REFRESH_INTERVAL_MS * 2);
    });
    expect(mocks.listRooms).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
  });
});
