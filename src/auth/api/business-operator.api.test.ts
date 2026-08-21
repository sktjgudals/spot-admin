import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

vi.mock("@/lib/uuid-v7", () => ({
  uuidV7: vi.fn(() => "01910000-0000-7000-8000-000000000001"),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  checkInByQr,
  checkInManually,
  getCheckInStatus,
  getOperatorPartyDetail,
  reviewPartyApplication,
} from "@/auth/api/business-operator.api";

describe("business-operator.api", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
  });

  it("uses the Cloudflare operator party and check-in paths", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({});

    await getOperatorPartyDetail("party/a");
    expect(adminFetchJson).toHaveBeenLastCalledWith("/parties/party%2Fa");

    await getCheckInStatus("party/a");
    expect(adminFetchJson).toHaveBeenLastCalledWith(
      "/parties/party%2Fa/check-in/status",
    );
  });

  it("reviews an application using the operator contract", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ success: true });

    await reviewPartyApplication({
      partyId: "party-1",
      applicationId: "application-1",
      status: "REJECTED",
      reason: "정원이 마감되었습니다.",
    });

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/parties/applications/status",
      {
        method: "PUT",
        body: JSON.stringify({
          partyId: "party-1",
          applicationId: "application-1",
          status: "REJECTED",
          reason: "정원이 마감되었습니다.",
        }),
      },
    );
  });

  it("creates a fresh action-scoped idempotency key for manual check-in", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ checkedIn: true });

    await checkInManually("party-1", "user-1");

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/parties/party-1/check-in/manual",
      {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          idempotencyKey: "admin-web:01910000-0000-7000-8000-000000000001",
        }),
      },
    );
  });

  it("posts a scanned QR token to the operator check-in path", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ checkedIn: true, replay: false });

    await checkInByQr("party-1", "qr-token-1");

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/parties/party-1/check-in/qr",
      {
        method: "POST",
        body: JSON.stringify({
          token: "qr-token-1",
          idempotencyKey: "admin-web-qr:01910000-0000-7000-8000-000000000001",
        }),
      },
    );
  });
});
