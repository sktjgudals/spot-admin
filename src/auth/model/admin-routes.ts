/**
 * Auth v2 Admin Web route contract (locked before Business/Party migration).
 *
 * Scope rules:
 * - SUPER_ADMIN: businessId always from URL (or selected business context)
 * - BUSINESS_ADMIN: businessId always from /me (admin.businessId) — never trust URL tenant id
 * - Cloudflare API tenant guards are the source of truth; frontend only navigates correctly
 */

import type { AdminWebRole } from "@/auth/model/admin-auth.types";

/**
 * Where a session that just came back unauthenticated goes.
 *
 * The marker matters as much as the path: edge middleware treats a session
 * cookie as proof of sign-in and sends /login to /app, so a cookie the API
 * has already refused would otherwise bounce the operator between the two
 * forever, showing nothing but the redirect screen.
 */
export const SIGNED_OUT_LOGIN_PATH = "/login?signedOut=1";

/** SUPER_ADMIN home — full admin chrome (banners, notifications, …) */
export const ROUTE_SUPER_ADMIN_HOME = "/super-admin/dashboard";

/** SUPER_ADMIN businesses list */
export const ROUTE_BUSINESSES = "/app/businesses";

/** BUSINESS_ADMIN home — full admin chrome (parties, settlements, chat, …) */
export const ROUTE_BUSINESS_HOME = "/app/parties";

/** BUSINESS_ADMIN parties list */
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
  return role === "SUPER_ADMIN" ? ROUTE_SUPER_ADMIN_HOME : ROUTE_BUSINESS_HOME;
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
}):
  | { businessId: string }
  | { error: "MISSING_BUSINESS_SCOPE" | "CROSS_TENANT_BLOCKED" } {
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

type PartyAdminScope = "business" | "super";

/** Cloudflare Admin API paths — single source for clients. */
export const AdminApi = {
  me: () => "/auth/v2/admin/me",
  dashboard: () => "/admin/v2/dashboard/summary",
  mailbox: () => "/admin/v2/mailbox",
  mailMessages: () => "/admin/v2/mail/messages",
  mailMessage: (id: string) =>
    `/admin/v2/mail/messages/${encodeURIComponent(id)}`,
  mailAttachment: (messageId: string, attachmentId: string) =>
    `/admin/v2/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  mailRetry: (id: string) =>
    `/admin/v2/mail/messages/${encodeURIComponent(id)}/retry`,
  businesses: () => "/admin/v2/businesses",
  business: (id: string) => `/admin/v2/businesses/${encodeURIComponent(id)}`,
  businessDisable: (id: string) =>
    `/admin/v2/businesses/${encodeURIComponent(id)}/disable`,
  businessEnable: (id: string) =>
    `/admin/v2/businesses/${encodeURIComponent(id)}/enable`,
  businessRestore: (id: string) =>
    `/admin/v2/businesses/${encodeURIComponent(id)}/restore`,
  businessCommerce: (id: string) =>
    `/admin/v2/businesses/${encodeURIComponent(id)}/commerce`,
  businessCommerceActivate: (id: string) =>
    `/admin/v2/businesses/${encodeURIComponent(id)}/commerce/activate`,
  businessCommercePause: (id: string) =>
    `/admin/v2/businesses/${encodeURIComponent(id)}/commerce/pause`,
  businessOperatorCandidates: () => "/admin/v2/business-operator-candidates",
  businessOperators: (businessId: string) =>
    `/admin/v2/businesses/${encodeURIComponent(businessId)}/operators`,
  invitations: (businessId: string) =>
    `/admin/v2/businesses/${encodeURIComponent(businessId)}/invitations`,
  invitationCancel: (businessId: string, invitationId: string) =>
    `/admin/v2/businesses/${encodeURIComponent(businessId)}/invitations/${encodeURIComponent(invitationId)}/cancel`,
  invitationResend: (businessId: string, invitationId: string) =>
    `/admin/v2/businesses/${encodeURIComponent(businessId)}/invitations/${encodeURIComponent(invitationId)}/resend`,
  myParties: () => "/businesses/me/parties",
  myParty: (partyId: string) =>
    `/businesses/me/parties/${encodeURIComponent(partyId)}`,
  parties: (businessId: string) =>
    `/admin/v2/businesses/${encodeURIComponent(businessId)}/parties`,
  party: (partyId: string) =>
    `/admin/v2/parties/${encodeURIComponent(partyId)}`,
  /** Kakao place search provided by the Cloudflare API. */
  placesKakaoSearch: () => `/places/kakao/search`,
  partyTransitions: (partyId: string, scope: PartyAdminScope = "business") =>
    scope === "super"
      ? `/admin/v2/parties/${encodeURIComponent(partyId)}/transitions`
      : `/parties/${encodeURIComponent(partyId)}/transitions`,
  partyStatusHistory: (partyId: string, scope: PartyAdminScope = "business") =>
    scope === "super"
      ? `/admin/v2/parties/${encodeURIComponent(partyId)}/status-history`
      : `/parties/${encodeURIComponent(partyId)}/status-history`,
  insights: (partyId?: string) =>
    partyId && partyId.length > 0
      ? `/businesses/me/insights?partyId=${encodeURIComponent(partyId)}`
      : "/businesses/me/insights",
  businessUserReviewTags: () => "/admin/v2/businesses/me/user-review-tags",
  reviewableMembers: (partyId: string) =>
    `/admin/v2/parties/${encodeURIComponent(partyId)}/reviewable-members`,
  businessUserReview: (partyId: string, userId: string) =>
    `/admin/v2/parties/${encodeURIComponent(partyId)}/user-reviews/${encodeURIComponent(userId)}`,
  applicationUserReviews: (applicationId: string) =>
    `/admin/v2/applications/${encodeURIComponent(applicationId)}/user-reviews`,
  superBusinessUserReviewTags: () =>
    "/admin/v2/super/business-user-review-tags",
  superBusinessUserReviewTag: (tagId: string) =>
    `/admin/v2/super/business-user-review-tags/${encodeURIComponent(tagId)}`,
  superBusinessUserReview: (reviewId: string) =>
    `/admin/v2/super/business-user-reviews/${encodeURIComponent(reviewId)}`,
  mailOutbox: () => "/admin/v2/auth-mail/outbox",
  mailOutboxItem: (id: string) =>
    `/admin/v2/auth-mail/outbox/${encodeURIComponent(id)}`,
  mailOutboxReprocess: (id: string) =>
    `/admin/v2/auth-mail/outbox/${encodeURIComponent(id)}/reprocess`,
  refundPolicyRequests: () => "/admin/v2/refund-policy-change-requests",
  refundPolicyRequest: (id: string) =>
    `/admin/v2/refund-policy-change-requests/${encodeURIComponent(id)}`,
  refundPolicyApprove: (id: string) =>
    `/admin/v2/refund-policy-change-requests/${encodeURIComponent(id)}/approve`,
  refundPolicyReject: (id: string) =>
    `/admin/v2/refund-policy-change-requests/${encodeURIComponent(id)}/reject`,
  refundRetry: (id: string) =>
    `/admin/v2/refunds/${encodeURIComponent(id)}/retry`,
  paymentManualRefund: (id: string) =>
    `/admin/v2/payments/${encodeURIComponent(id)}/manual-refund`,
  paymentConfirm: (id: string) =>
    `/admin/v2/payments/${encodeURIComponent(id)}/confirm`,
} as const;
