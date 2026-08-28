import { adminFetch, adminFetchJson } from "@/auth/api/admin-http";
import { AdminApi } from "@/auth/model/admin-routes";

export type MailFolder = "INBOX" | "SENT" | "ARCHIVE" | "SPAM" | "TRASH";
export type MailDeliveryStatus =
  | "QUEUED"
  | "ACCEPTED"
  | "DELIVERED"
  | "BOUNCED"
  | "FAILED"
  | "UNKNOWN";

export type MailAddress = { name: string; address: string };

export type MailMessage = {
  id: string;
  threadId: string;
  direction: "INBOUND" | "OUTBOUND";
  folder: MailFolder;
  deliveryStatus: MailDeliveryStatus;
  rfcMessageId: string | null;
  providerMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  snippet: string;
  isRead: boolean;
  hasAttachments: boolean;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  activityAt: number;
  receivedAt: number | null;
  sentAt: number | null;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
};

export type MailAttachment = {
  id: string;
  messageId: string;
  filename: string;
  contentType: string;
  size: number;
  disposition: "attachment" | "inline";
  contentId: string | null;
};

export type MailboxSummary = {
  address: string;
  name: string;
  folders: { folder: MailFolder; total: number; unread: number }[];
  unreadTotal: number;
  asOf: string;
};

export type MailListPage = {
  items: MailMessage[];
  nextCursor: string | null;
  asOf: string;
};

export type MailMessageDetail = {
  message: MailMessage;
  text: string | null;
  html: string | null;
  attachments: MailAttachment[];
  thread: MailMessage[];
};

export async function fetchMailbox(): Promise<MailboxSummary> {
  return adminFetchJson<MailboxSummary>(AdminApi.mailbox());
}

export async function listMailMessages(params: {
  folder: MailFolder;
  query?: string;
  unread?: boolean;
  cursor?: string;
  limit?: number;
}): Promise<MailListPage> {
  const query = new URLSearchParams({ folder: params.folder });
  if (params.query) query.set("query", params.query);
  if (params.unread !== undefined) query.set("unread", String(params.unread));
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  return adminFetchJson<MailListPage>(`${AdminApi.mailMessages()}?${query}`);
}

export async function fetchMailMessage(id: string): Promise<MailMessageDetail> {
  return adminFetchJson<MailMessageDetail>(AdminApi.mailMessage(id));
}

export async function composeMail(form: FormData): Promise<{
  message: MailMessage | null;
  queued: true;
}> {
  return adminFetchJson(AdminApi.mailMessages(), { method: "POST", body: form });
}

export async function patchMailMessage(
  id: string,
  patch: { isRead?: boolean; folder?: MailFolder },
): Promise<{ message: MailMessage }> {
  return adminFetchJson(AdminApi.mailMessage(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function retryMailMessage(
  id: string,
): Promise<{ message: MailMessage | null; queued: true }> {
  return adminFetchJson(AdminApi.mailRetry(id), { method: "POST" });
}

export async function downloadMailAttachment(
  messageId: string,
  attachment: Pick<MailAttachment, "id" | "filename">,
): Promise<void> {
  const response = await adminFetch(AdminApi.mailAttachment(messageId, attachment.id));
  if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = attachment.filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}
