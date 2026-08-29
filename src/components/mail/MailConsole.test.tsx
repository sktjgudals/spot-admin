import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
