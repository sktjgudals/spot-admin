import { adminFetchJson } from "@/auth/api/admin-http";
import { NestAdminApi } from "@/auth/model/admin-routes";

export type AuthMailOutboxStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "CANCELLED"
  | "DEAD";

export type AuthMailType =
  | "BOOTSTRAP_CODE"
  | "INVITATION"
  | "PASSWORD_RESET";

export type AuthMailOutboxRow = {
  id: string;
  type: AuthMailType;
  status: AuthMailOutboxStatus;
  recipientEmail: string;
  idempotencyKey: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  tokenVersion: number | null;
  nextAttemptAt: string;
  attempts: number;
  maxAttempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export async function listMailOutbox(params?: {
  status?: AuthMailOutboxStatus;
  type?: AuthMailType;
}): Promise<AuthMailOutboxRow[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.type) q.set("type", params.type);
  const s = q.toString();
  return adminFetchJson<AuthMailOutboxRow[]>(
    `${NestAdminApi.mailOutbox()}${s ? `?${s}` : ""}`,
  );
}

/** Latest INVITATION outbox row per invitation id (client filter). */
export function latestInviteDeliveryByInvitationId(
  rows: AuthMailOutboxRow[],
  invitationIds: string[],
): Map<string, AuthMailOutboxRow> {
  const want = new Set(invitationIds);
  const map = new Map<string, AuthMailOutboxRow>();
  // rows assumed createdAt desc from API
  for (const row of rows) {
    if (row.type !== "INVITATION") continue;
    if (row.relatedEntityType !== "BusinessInvitation") continue;
    const invId = row.relatedEntityId;
    if (!invId || !want.has(invId)) continue;
    if (!map.has(invId)) map.set(invId, row);
  }
  return map;
}

export async function reprocessMailOutbox(
  id: string,
): Promise<{ id: string; status: string }> {
  return adminFetchJson(NestAdminApi.mailOutboxReprocess(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export const mailOutboxQueryKeys = {
  all: ["admin", "mail-outbox"] as const,
  list: (params?: { status?: AuthMailOutboxStatus; type?: AuthMailType }) =>
    [...mailOutboxQueryKeys.all, "list", params ?? {}] as const,
};
