import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminApi } from "@/auth/model/admin-routes";

export type RefundPolicyTier = {
  hoursBeforeStart: number;
  refundPercent: number;
};

export type RefundPolicyView = {
  fingerprint: string;
  source: "DEFAULT" | "APPROVED" | "LEGACY" | "LEGACY_MIGRATED";
  sourceRequestId: string | null;
  businessId: string | null;
  businessName: string;
  tiers: RefundPolicyTier[];
  policyDescription: string[];
  legalNotice: string;
  processorName: string;
  contactRoute: string;
};

export type RefundPolicyChangeRequest = {
  id: string;
  businessId: string;
  businessName: string;
  requesterName: string | null;
  proposedTiers: RefundPolicyTier[];
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type RefundPolicyRequestDetail = {
  request: RefundPolicyChangeRequest;
  current: RefundPolicyView;
};

export function listRefundPolicyRequests(
  status: RefundPolicyChangeRequest["status"] | "ALL" = "PENDING",
) {
  const query = status === "ALL" ? "" : `?status=${status}`;
  return adminFetchJson<RefundPolicyChangeRequest[]>(
    `${AdminApi.refundPolicyRequests()}${query}`,
  );
}

export function getRefundPolicyRequest(id: string) {
  return adminFetchJson<RefundPolicyRequestDetail>(
    AdminApi.refundPolicyRequest(id),
  );
}

export function approveRefundPolicyRequest(id: string, reason?: string) {
  return adminFetchJson<RefundPolicyChangeRequest>(
    AdminApi.refundPolicyApprove(id),
    {
      method: "POST",
      body: JSON.stringify({ reason: reason?.trim() || undefined }),
    },
  );
}

export function rejectRefundPolicyRequest(id: string, reason: string) {
  return adminFetchJson<RefundPolicyChangeRequest>(
    AdminApi.refundPolicyReject(id),
    {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    },
  );
}

export const refundPolicyRequestKeys = {
  all: ["admin", "refund-policy-requests"] as const,
  list: (status: string) =>
    [...refundPolicyRequestKeys.all, "list", status] as const,
  detail: (id: string) =>
    [...refundPolicyRequestKeys.all, "detail", id] as const,
};
