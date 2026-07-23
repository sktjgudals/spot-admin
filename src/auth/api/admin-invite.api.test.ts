import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  cancelInvitation,
  createInvitation,
  listInvitations,
  resendInvitation,
} from "@/auth/api/admin-invite.api";

describe("admin-invite.api", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
  });

  it("listInvitations", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue([]);
    await listInvitations("biz-1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz-1/invitations",
    );
  });

  it("createInvitation posts BUSINESS_ADMIN role", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({
      invitation: { id: "i1" },
    });
    await createInvitation("biz-1", "a@b.com");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz-1/invitations",
      {
        method: "POST",
        body: JSON.stringify({
          email: "a@b.com",
          role: "BUSINESS_ADMIN",
        }),
      },
    );
  });

  it("cancel and resend paths", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({});
    await cancelInvitation("biz-1", "inv-1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz-1/invitations/inv-1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
    await resendInvitation("biz-1", "inv-1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz-1/invitations/inv-1/resend",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
