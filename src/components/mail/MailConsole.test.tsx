import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-mail.api", () => ({
  composeMail: vi.fn(),
  downloadMailAttachment: vi.fn(),
  fetchMailbox: vi.fn(),
  fetchMailMessage: vi.fn(),
  listMailMessages: vi.fn(),
  patchMailMessage: vi.fn(),
  retryMailMessage: vi.fn(),
}));

import {
  composeMail,
  fetchMailbox,
  fetchMailMessage,
  listMailMessages,
  patchMailMessage,
  retryMailMessage,
  type MailMessage,
} from "@/auth/api/admin-mail.api";
import { MailConsole } from "@/components/mail/MailConsole";

const message: MailMessage = {
  id: "mail-1",
  threadId: "thread-1",
  direction: "INBOUND",
  folder: "INBOX",
  deliveryStatus: "DELIVERED",
  rfcMessageId: "<mail-1@example.com>",
  providerMessageId: null,
  inReplyTo: null,
  references: [],
  from: [{ name: "보낸 사람", address: "sender@example.com" }],
  to: [{ name: "관리자", address: "owner@dopa.ing" }],
  cc: [],
  bcc: [],
  subject: "분기 계획",
  snippet: "계획안을 공유합니다.",
  isRead: false,
  hasAttachments: false,
  recipientCount: 1,
  deliveredCount: 1,
  failedCount: 0,
  lastErrorCode: null,
  lastErrorMessage: null,
  activityAt: Date.UTC(2026, 7, 28, 3),
  receivedAt: Date.UTC(2026, 7, 28, 3),
  sentAt: null,
  createdAt: Date.UTC(2026, 7, 28, 3),
  updatedAt: Date.UTC(2026, 7, 28, 3),
  messageCount: 1,
};

const nextMessage: MailMessage = {
  ...message,
  id: "mail-2",
  threadId: "thread-2",
  rfcMessageId: "<mail-2@example.com>",
  subject: "다음 분기 계획",
  snippet: "다음 계획안을 공유합니다.",
};

function renderMail(compact = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MailConsole compact={compact} />
    </QueryClientProvider>,
  );
}

describe("MailConsole", () => {
  beforeEach(() => {
    vi.mocked(fetchMailbox).mockResolvedValue({
      address: "owner@dopa.ing",
      senders: [
        { name: "관리자", address: "owner@dopa.ing" },
        { name: "관리자", address: "contact@dopa.ing" },
      ],
      name: "관리자",
      folders: [
        { folder: "INBOX", total: 1, unread: 1 },
        { folder: "SENT", total: 0, unread: 0 },
        { folder: "ARCHIVE", total: 0, unread: 0 },
        { folder: "SPAM", total: 0, unread: 0 },
        { folder: "TRASH", total: 0, unread: 0 },
      ],
      unreadTotal: 1,
      asOf: "2026-08-28T03:00:00.000Z",
    });
    vi.mocked(listMailMessages).mockImplementation(async ({ folder, query }) => ({
      items: folder === "INBOX" && (!query || query === "계획") ? [message] : [],
      nextCursor: null,
      asOf: "2026-08-28T03:00:00.000Z",
    }));
    vi.mocked(fetchMailMessage).mockResolvedValue({
      message,
      text: "계획안 본문입니다.",
      html: null,
      attachments: [],
      thread: [message],
    });
    vi.mocked(patchMailMessage).mockResolvedValue({
      message: { ...message, isRead: true },
    });
    vi.mocked(composeMail).mockResolvedValue({ queued: true, message: null });
    vi.mocked(retryMailMessage).mockResolvedValue({
      queued: true,
      message: { ...message, direction: "OUTBOUND", deliveryStatus: "QUEUED" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("navigates folders, searches, opens details, and marks unread mail read", async () => {
    const user = userEvent.setup();
    renderMail();

    await user.click(await screen.findByText("분기 계획"));
    expect(await screen.findByText("계획안 본문입니다.")).toBeInTheDocument();
    expect(fetchMailMessage).toHaveBeenCalledWith("mail-1");
    expect(patchMailMessage).toHaveBeenCalledWith("mail-1", { isRead: true });

    await user.click(screen.getByRole("button", { name: "메일 목록으로" }));
    const search = screen.getByRole("textbox", { name: "메일 검색" });
    await user.type(search, "계획{enter}");
    await waitFor(() =>
      expect(listMailMessages).toHaveBeenCalledWith(
        expect.objectContaining({ folder: "INBOX", query: "계획" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "폴더 목록" }));
    await user.click(screen.getByRole("button", { name: /보낸편지함/ }));
    await waitFor(() =>
      expect(listMailMessages).toHaveBeenCalledWith(
        expect.objectContaining({ folder: "SENT" }),
      ),
    );
  });

  it("does not rerender retained rows or an opened detail while typing a search draft", async () => {
    const user = userEvent.setup();
    const listRenderReads = vi.fn(() => "계획안을 공유합니다.");
    const detailRenderReads = vi.fn(() => "계획안 본문입니다.");
    const measuredMessage = { ...message, isRead: true };
    Object.defineProperty(measuredMessage, "snippet", {
      configurable: true,
      enumerable: true,
      get: listRenderReads,
    });
    const measuredDetail = {
      message: measuredMessage,
      text: "계획안 본문입니다.",
      html: null,
      attachments: [],
      thread: [measuredMessage],
    } satisfies Awaited<ReturnType<typeof fetchMailMessage>>;
    Object.defineProperty(measuredDetail, "text", {
      configurable: true,
      enumerable: true,
      get: detailRenderReads,
    });
    vi.mocked(listMailMessages).mockResolvedValue({
      items: [measuredMessage],
      nextCursor: null,
      asOf: "2026-08-28T03:00:00.000Z",
    });
    vi.mocked(fetchMailMessage).mockResolvedValue(measuredDetail);
    renderMail();

    await user.click(await screen.findByText("분기 계획"));
    expect(await screen.findByText("계획안 본문입니다.")).toBeInTheDocument();
    listRenderReads.mockClear();
    detailRenderReads.mockClear();

    const search = screen.getByRole("textbox", { name: "메일 검색" });
    await user.type(search, "계획 검색어");

    expect(listRenderReads).not.toHaveBeenCalled();
    expect(detailRenderReads).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(listMailMessages).toHaveBeenCalledWith(
        expect.objectContaining({ folder: "INBOX", query: "계획 검색어" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "검색 지우기" }));
    await waitFor(() =>
      expect(listMailMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ folder: "INBOX", query: undefined }),
      ),
    );
  });

  it("announces the current folder, selected mail, unread filter, and unread state", async () => {
    const user = userEvent.setup();
    renderMail(true);

    const inbox = await screen.findByRole("button", { name: /받은편지함/u });
    const mail = await screen.findByRole("button", { name: /분기 계획/u });
    const unreadFilter = screen.getByRole("button", { name: "안읽음" });

    expect(inbox).toHaveAttribute("aria-current", "page");
    expect(mail).not.toHaveAttribute("aria-current");
    expect(unreadFilter).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("읽지 않음")).toHaveClass("sr-only");

    await user.click(unreadFilter);
    expect(unreadFilter).toHaveAttribute("aria-pressed", "true");

    const filteredMail = await screen.findByRole("button", { name: /분기 계획/u });
    await user.click(filteredMail);
    expect(filteredMail).toHaveAttribute("aria-current", "true");
  });

  it("updates cached read state without refetching every retained list page", async () => {
    const user = userEvent.setup();
    renderMail();

    const mail = await screen.findByRole("button", { name: /분기 계획/u });
    expect(within(mail).getByText("읽지 않음")).toBeInTheDocument();
    const initialListCalls = vi.mocked(listMailMessages).mock.calls.length;
    await user.click(mail);

    await waitFor(() => expect(patchMailMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(mail).queryByText("읽지 않음")).not.toBeInTheDocument());
    expect(listMailMessages).toHaveBeenCalledTimes(initialListCalls);
  });

  it("moves focus into each compact pane and restores the mail trigger on back", async () => {
    const user = userEvent.setup();
    renderMail(true);

    const mail = await screen.findByRole("button", { name: /분기 계획/u });
    await user.click(mail);

    const detailHeading = await screen.findByRole("heading", { name: "분기 계획" });
    await waitFor(() => expect(detailHeading).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "메일 목록으로" }));
    await waitFor(() => expect(mail).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "폴더 목록" }));
    const inbox = screen.getByRole("button", { name: /받은편지함/u });
    await waitFor(() => expect(inbox).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /보낸편지함/u }));
    const listHeading = screen.getByRole("heading", { name: "보낸편지함" });
    await waitFor(() => expect(listHeading).toHaveFocus());
  });

  it("falls back to the list heading when an unread mail disappears before back navigation", async () => {
    const user = userEvent.setup();
    renderMail(true);

    await user.click(await screen.findByRole("button", { name: "안읽음" }));
    await user.click(await screen.findByRole("button", { name: /분기 계획/u }));
    await waitFor(() => expect(patchMailMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /분기 계획/u })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "메일 목록으로" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "받은편지함" })).toHaveFocus(),
    );
  });

  it("keeps retained messages visible when loading the next page fails", async () => {
    const user = userEvent.setup();
    vi.mocked(listMailMessages)
      .mockResolvedValueOnce({
        items: [message],
        nextCursor: "next-page",
        asOf: "2026-08-28T03:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("next page unavailable"));
    renderMail(true);

    expect(await screen.findByText("분기 계획")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "다음 메일을 불러오지 못했습니다.",
    );
    expect(screen.getByText("분기 계획")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "다음 메일 다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
  });

  it("focuses the first newly appended mail when the terminal cursor page loads", async () => {
    const user = userEvent.setup();
    vi.mocked(listMailMessages)
      .mockResolvedValueOnce({
        items: [message],
        nextCursor: "next-page",
        asOf: "2026-08-28T03:00:00.000Z",
      })
      .mockResolvedValueOnce({
        items: [nextMessage],
        nextCursor: null,
        asOf: "2026-08-28T03:00:01.000Z",
      });
    renderMail(true);

    expect(await screen.findByText("분기 계획")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    const appendedMail = await screen.findByRole("button", {
      name: /다음 분기 계획/u,
    });
    await waitFor(() => expect(appendedMail).toHaveFocus());
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });

  it("creates a multipart message from the rich-text editor", async () => {
    const user = userEvent.setup();
    renderMail();

    await user.click(await screen.findByRole("button", { name: /새 메일/ }));
    await user.type(screen.getByLabelText("받는 사람"), "friend@example.com");
    await user.type(screen.getByLabelText("제목"), "안녕하세요");
    const editor = await screen.findByLabelText("텍스트 본문");
    await user.click(screen.getByRole("button", { name: "굵게" }));
    await user.type(editor, "본문입니다");
    await user.selectOptions(screen.getByLabelText("보내는 사람"), "contact@dopa.ing");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => expect(composeMail).toHaveBeenCalledTimes(1));
    const form = vi.mocked(composeMail).mock.calls[0]?.[0];
    expect(form).toBeInstanceOf(FormData);
    expect(form?.get("fromAddress")).toBe("contact@dopa.ing");
    expect(JSON.parse(String(form?.get("to")))).toEqual([
      { name: "", address: "friend@example.com" },
    ]);
    expect(form?.get("subject")).toBe("안녕하세요");
    expect(form?.get("text")).toBe("본문입니다");
    expect(form?.get("html")).toContain("<strong>본문입니다</strong>");
  });

  it("prefers the original recipient alias when replying", async () => {
    const user = userEvent.setup();
    const aliasedMessage = {
      ...message,
      to: [{ name: "관리자", address: "contact@dopa.ing" }],
    };
    vi.mocked(listMailMessages).mockResolvedValue({
      items: [aliasedMessage],
      nextCursor: null,
      asOf: "now",
    });
    vi.mocked(fetchMailMessage).mockResolvedValue({
      message: aliasedMessage,
      text: "계획안 본문입니다.",
      html: null,
      attachments: [],
      thread: [aliasedMessage],
    });
    renderMail();

    await user.click(await screen.findByText("분기 계획"));
    await user.click(await screen.findByRole("button", { name: "답장" }));
    expect(screen.getByLabelText("보내는 사람")).toHaveValue("contact@dopa.ing");
    await user.type(await screen.findByLabelText("텍스트 본문"), "확인했습니다.");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => expect(composeMail).toHaveBeenCalledTimes(1));
    const form = vi.mocked(composeMail).mock.calls[0]?.[0];
    expect(form?.get("fromAddress")).toBe("contact@dopa.ing");
    expect(form?.get("replyToMessageId")).toBe("mail-1");
  });

  it("forces the business mailbox into the compact single-pane layout", async () => {
    const { container } = renderMail(true);
    expect(await screen.findByText("분기 계획")).toBeInTheDocument();
    const compact = container.querySelector('[data-mail-layout="compact"]');
    expect(compact).toHaveClass("h-[calc(100dvh-4rem)]");
    expect(compact?.firstElementChild).not.toHaveClass(
      "md:grid-cols-[210px_360px_minmax(0,1fr)]",
    );
    expect(compact?.querySelector("aside")).not.toHaveClass("md:flex");
  });

  it("keeps responsive mail single-pane until xl protects the detail controls", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MailConsole compact responsiveCompact />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("분기 계획")).toBeInTheDocument();
    const layout = container.querySelector('[data-mail-layout="responsive-compact"]');
    expect(layout?.firstElementChild).toHaveClass(
      "xl:grid-cols-[230px_400px_minmax(0,1fr)]",
    );
    expect(layout?.firstElementChild).not.toHaveClass(
      "md:grid-cols-[210px_360px_minmax(0,1fr)]",
    );
    expect(layout?.querySelector("aside")).toHaveClass("xl:flex");
    expect(layout?.querySelector("aside")).not.toHaveClass("md:flex");
  });

  it("attaches the selected mailbox message as an .eml source", async () => {
    const user = userEvent.setup();
    renderMail();

    await user.click(await screen.findByText("분기 계획"));
    await user.click(await screen.findByRole("button", { name: "메일 첨부" }));
    expect(screen.getByText(/분기 계획\.eml · 원본 메일/u)).toBeInTheDocument();
    await user.type(screen.getByLabelText("받는 사람"), "friend@example.com");
    await user.type(await screen.findByLabelText("텍스트 본문"), "원본 메일을 첨부합니다.");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => expect(composeMail).toHaveBeenCalledTimes(1));
    const form = vi.mocked(composeMail).mock.calls[0]?.[0];
    expect(JSON.parse(String(form?.get("attachedMessageIds")))).toEqual(["mail-1"]);
  });

  it("requires an explicit action before retrying an unknown send", async () => {
    const user = userEvent.setup();
    const unknown = {
      ...message,
      direction: "OUTBOUND" as const,
      folder: "SENT" as const,
      deliveryStatus: "UNKNOWN" as const,
      lastErrorCode: "MAIL_SEND_OUTCOME_UNCERTAIN",
      lastErrorMessage: "결과를 확인할 수 없습니다.",
      isRead: true,
    };
    vi.mocked(listMailMessages).mockResolvedValue({
      items: [unknown],
      nextCursor: null,
      asOf: "now",
    });
    vi.mocked(fetchMailMessage).mockResolvedValue({
      message: unknown,
      text: "보낸 본문",
      html: null,
      attachments: [],
      thread: [unknown],
    });
    renderMail();

    await user.click(await screen.findByText("분기 계획"));
    await user.click(await screen.findByRole("button", { name: "명시적으로 다시 보내기" }));

    expect(retryMailMessage).toHaveBeenCalledWith("mail-1");
  });
});
