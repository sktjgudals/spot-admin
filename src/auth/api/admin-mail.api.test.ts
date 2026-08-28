import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetch: vi.fn(),
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  composeMail,
  listMailMessages,
  patchMailMessage,
  retryMailMessage,
} from "@/auth/api/admin-mail.api";

describe("admin mail API", () => {
  beforeEach(() => vi.mocked(adminFetchJson).mockReset());

  it("encodes folder, search, unread, and cursor filters", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ items: [], nextCursor: null, asOf: "now" });
    await listMailMessages({
      folder: "INBOX",
      query: "quarterly plan",
      unread: true,
      cursor: "a/b",
      limit: 20,
    });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/mail/messages?folder=INBOX&query=quarterly+plan&unread=true&cursor=a%2Fb&limit=20",
    );
  });

  it("sends compose as multipart and keeps state mutations user-scoped", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ queued: true, message: null });
    const form = new FormData();
    form.set("to", "[]");
    await composeMail(form);
    expect(adminFetchJson).toHaveBeenLastCalledWith("/admin/v2/mail/messages", {
      method: "POST",
      body: form,
    });

    await patchMailMessage("mail/a", { folder: "ARCHIVE" });
    expect(adminFetchJson).toHaveBeenLastCalledWith("/admin/v2/mail/messages/mail%2Fa", {
      method: "PATCH",
      body: JSON.stringify({ folder: "ARCHIVE" }),
    });

    await retryMailMessage("mail/a");
    expect(adminFetchJson).toHaveBeenLastCalledWith(
      "/admin/v2/mail/messages/mail%2Fa/retry",
      { method: "POST" },
    );
  });
});
