/**
 * Auth v2 Admin Web route contract (locked before Business/Party migration).
 *
 * Scope rules:
 * - SUPER_ADMIN: businessId always from URL (or selected business context)
 * - BUSINESS_ADMIN: businessId always from /me (admin.businessId) — never trust URL tenant id
 * - Nest BusinessScopeGuard is source of truth; frontend only navigates correctly
 */

import type { AdminWebRole } from "@/auth/model/admin-auth.types";

/** SUPER_ADMIN home */
export const ROUTE_BUSINESSES = "/app/businesses";

/** BUSINESS_ADMIN home — own tenant parties only */
export const ROUTE_MY_PARTIES = "/app/parties";

export function businessDetailPath(businessId: string): string {
  return `/app/businesses/${encodeURIComponent(businessId)}`;
}

export function businessInvitationsPath(businessId: string): string {
  return `/app/businesses/${encodeURIComponent(businessId)}/invitations`;
}

/**
 * SUPER_ADMIN party list for a specific tenant.
 * businessId is required in the path so API calls always pass explicit scope.
 */
export function businessPartiesPath(businessId: string): string {
  return `/app/businesses/${encodeURIComponent(businessId)}/parties`;
}

export function businessPartyDetailPath(
  businessId: string,
  partyId: string,
): string {
  return `/app/businesses/${encodeURIComponent(businessId)}/parties/${encodeURIComponent(partyId)}`;
}

/** BUSINESS_ADMIN party detail (no foreign businessId in URL) */
export function myPartyDetailPath(partyId: string): string {
  return `/app/parties/${encodeURIComponent(partyId)}`;
}

export function homePathForRole(role: AdminWebRole): string {
  return role === "SUPER_ADMIN" ? ROUTE_BUSINESSES : ROUTE_MY_PARTIES;
}

/**
 * Resolve effective businessId for API calls.
 * BUSINESS_ADMIN: always profile.businessId (ignore URL).
 * SUPER_ADMIN: must use route/param businessId.
 */
export function resolveBusinessScope(input: {
  role: AdminWebRole;
  profileBusinessId: string | null;
  /** From URL params — SUPER_ADMIN only */
  routeBusinessId?: string | null;
}): { businessId: string } | { error: "MISSING_BUSINESS_SCOPE" | "CROSS_TENANT_BLOCKED" } {
  if (input.role === "BUSINESS_ADMIN") {
    if (!input.profileBusinessId) {
      return { error: "MISSING_BUSINESS_SCOPE" };
    }
    // Ignore route businessId if present and mismatches — block UI navigation
    if (
      input.routeBusinessId &&
      input.routeBusinessId !== input.profileBusinessId
    ) {
      return { error: "CROSS_TENANT_BLOCKED" };
    }
    return { businessId: input.profileBusinessId };
  }

  // SUPER_ADMIN
  if (!input.routeBusinessId) {
    return { error: "MISSING_BUSINESS_SCOPE" };
  }
  return { businessId: input.routeBusinessId };
}

/** Nest Admin API paths (spot-backend) — single source for clients */
export const NestAdminApi = {
  businesses: () => "/admin/v2/businesses",
  business: (id: string) => `/admin/v2/businesses/${id}`,
  businessDisable: (id: string) => `/admin/v2/businesses/${id}/disable`,
  businessEnable: (id: string) => `/admin/v2/businesses/${id}/enable`,
  businessRestore: (id: string) => `/admin/v2/businesses/${id}/restore`,
  invitations: (businessId: string) =>
    `/admin/v2/businesses/${businessId}/invitations`,
  invitationCancel: (businessId: string, invitationId: string) =>
    `/admin/v2/businesses/${businessId}/invitations/${invitationId}/cancel`,
  invitationResend: (businessId: string, invitationId: string) =>
    `/admin/v2/businesses/${businessId}/invitations/${invitationId}/resend`,
  parties: (businessId: string) =>
    `/admin/v2/businesses/${businessId}/parties`,
  party: (partyId: string) => `/admin/v2/parties/${partyId}`,
  mailOutbox: () => "/admin/v2/auth-mail/outbox",
  mailOutboxItem: (id: string) => `/admin/v2/auth-mail/outbox/${id}`,
  mailOutboxReprocess: (id: string) =>
    `/admin/v2/auth-mail/outbox/${id}/reprocess`,
} as const;
