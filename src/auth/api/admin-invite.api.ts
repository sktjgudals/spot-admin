import { adminFetchJson } from "@/auth/api/admin-http";
import { NestAdminApi } from "@/auth/model/admin-routes";

export type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";

export type AdminInvitation = {
  id: string;
  email: string;
  businessId: string;
  role: string;
  status: InvitationStatus;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  resendCount: number;
  lastSentAt: string;
  tokenVersion: number;
  createdAt: string;
};

export type InviteMutationResult = {
  invitation: AdminInvitation;
  /** Dev only when ADMIN_INVITE_TOKEN_RESPONSE_ENABLED */
  inviteToken?: string;
};

export async function listInvitations(
  businessId: string,
): Promise<AdminInvitation[]> {
  return adminFetchJson<AdminInvitation[]>(
    NestAdminApi.invitations(businessId),
  );
}

export async function createInvitation(
  businessId: string,
  email: string,
): Promise<InviteMutationResult> {
  return adminFetchJson<InviteMutationResult>(
    NestAdminApi.invitations(businessId),
    {
      method: "POST",
      body: JSON.stringify({
        email,
        role: "BUSINESS_ADMIN",
      }),
    },
  );
}

export async function cancelInvitation(
  businessId: string,
  invitationId: string,
): Promise<AdminInvitation> {
  return adminFetchJson<AdminInvitation>(
    NestAdminApi.invitationCancel(businessId, invitationId),
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function resendInvitation(
  businessId: string,
  invitationId: string,
): Promise<InviteMutationResult> {
  return adminFetchJson<InviteMutationResult>(
    NestAdminApi.invitationResend(businessId, invitationId),
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export const inviteQueryKeys = {
  all: ["admin", "invitations"] as const,
  list: (businessId: string) =>
    [...inviteQueryKeys.all, "list", businessId] as const,
};
