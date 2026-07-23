import { describe, expect, it } from "vitest";
import {
  latestInviteDeliveryByInvitationId,
  type AuthMailOutboxRow,
} from "@/auth/api/admin-mail-outbox.api";

function row(
  partial: Partial<AuthMailOutboxRow> & { id: string; relatedEntityId: string },
): AuthMailOutboxRow {
  return {
    type: "INVITATION",
    status: "SENT",
    recipientEmail: "a@b.com",
    idempotencyKey: partial.id,
    relatedEntityType: "BusinessInvitation",
    tokenVersion: 0,
    nextAttemptAt: new Date().toISOString(),
    attempts: 0,
    maxAttempts: 8,
    providerMessageId: null,
    lastError: null,
    sentAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("latestInviteDeliveryByInvitationId", () => {
  it("picks first (newest) row per invitation", () => {
    const rows = [
      row({ id: "m2", relatedEntityId: "inv-1", status: "SENT" }),
      row({ id: "m1", relatedEntityId: "inv-1", status: "CANCELLED" }),
      row({ id: "m3", relatedEntityId: "inv-2", status: "PENDING" }),
    ];
    const map = latestInviteDeliveryByInvitationId(rows, ["inv-1", "inv-2"]);
    expect(map.get("inv-1")?.id).toBe("m2");
    expect(map.get("inv-2")?.status).toBe("PENDING");
  });
});
