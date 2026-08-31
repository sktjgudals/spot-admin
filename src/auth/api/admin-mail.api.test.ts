import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-http")>();
  return {
    ...actual,
    adminFetch: vi.fn(),
    adminFetchJson: vi.fn(),
  };
});

import { adminFetch, adminFetchJson } from "@/auth/api/admin-http";
import {
  __resetAccessTokenForTests,
  setAuthenticatedAdminSession,
} from "@/auth/store/admin-auth.store";
import {
  composeMail,
  downloadMailAttachment,
  listMailMessages,
  patchMailMessage,
  retryMailMessage,
} from "@/auth/api/admin-mail.api";

describe("admin mail API", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
    vi.mocked(adminFetchJson).mockReset();
    __resetAccessTokenForTests();
  });

  afterEach(() => {
    __resetAccessTokenForTests();
  });

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

  it("does not materialize an attachment after the administrator session changes", async () => {
    let resolveBlob!: (blob: Blob) => void;
    const response = new Response("attachment");
    vi.spyOn(response, "blob").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBlob = resolve;
        }),
    );
    vi.mocked(adminFetch).mockResolvedValue(response);
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });

    const download = downloadMailAttachment("message-a", {
      id: "attachment-a",
      filename: "private.pdf",
    });
    await vi.waitFor(() => expect(response.blob).toHaveBeenCalledTimes(1));
    setAuthenticatedAdminSession("admin-b-token", {
      id: "admin-b",
      role: "BUSINESS_ADMIN",
      businessId: "business-b",
    });
    resolveBlob(new Blob(["attachment"]));

    await expect(download).rejects.toMatchObject({
      code: "SESSION_CHANGED_DURING_REQUEST",
    });
  });
});
