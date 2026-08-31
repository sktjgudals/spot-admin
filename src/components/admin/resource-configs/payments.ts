import { AdminApi } from "@/auth/model/admin-routes";
import type { ResourceConfig } from "./types";
import { remainingRefundable } from "./helpers";

export const refundPolicyRequestsConfig: ResourceConfig = {
  key: "refund-policy-requests",
  title: "환불 정책 변경",
  description: "업체의 환불 정책 변경 요청을 검토합니다.",
  resource: "refund-policy-change-requests",
  statusOptions: [
    { value: "PENDING", label: "검토 대기" },
    { value: "APPROVED", label: "승인" },
    { value: "REJECTED", label: "거절" },
  ],
  columns: [
    { key: "businessName", label: "업체" },
    { key: "proposedTiers", label: "정책" },
    { key: "reason", label: "사유" },
    { key: "status", label: "상태" },
    { key: "createdAt", label: "요청일" },
  ],
  actions: [
    {
      label: "승인",
      path: (row) => AdminApi.refundPolicyApprove(String(row.id)),
      hidden: (row) => row.status !== "PENDING",
      body: () => ({}),
    },
    {
      label: "거절",
      path: (row) => AdminApi.refundPolicyReject(String(row.id)),
      hidden: (row) => row.status !== "PENDING",
      destructive: true,
      confirm: { reason: { label: "거절 사유", required: true } },
      body: (_row, fields) =>
        fields.reason?.trim() ? { reason: fields.reason.trim() } : null,
    },
  ],
};

export const paymentsConfig: ResourceConfig = {
  key: "payments",
  title: "결제 관리",
  description:
    "전체 결제 내역을 검색하고, 미확정 건은 토스에서 재조회해 확정하거나 완료 건을 환불합니다.",
  resource: "payments",
  columns: [
    { key: "orderId", label: "주문번호" },
    { key: "partyTitle", label: "파티" },
    { key: "businessName", label: "업체" },
    { key: "userId", label: "유저" },
    { key: "method", label: "수단" },
    { key: "amount", label: "금액" },
    { key: "refundedAmount", label: "환불누적" },
    { key: "status", label: "상태" },
    { key: "createdAt", label: "결제일" },
  ],
  actions: [
    {
      label: "토스 재조회 확정",
      path: (row) => AdminApi.paymentConfirm(String(row.id)),
      hidden: (row) => !["READY", "IN_PROGRESS"].includes(String(row.status)),
      body: () => ({}),
    },
    {
      label: "수동 환불",
      path: (row) => AdminApi.paymentManualRefund(String(row.id)),
      destructive: true,
      hidden: (row) => !["DONE", "PARTIAL_CANCELLED"].includes(String(row.status)),
      confirm: {
        amount: { label: "환불 금액(원)", defaultValue: remainingRefundable },
        reason: {
          label: "환불 사유",
          required: true,
          defaultValue: "관리자 수동 환불",
        },
      },
      body: (_row, fields) => {
        const amount = Number(fields.amount);
        const reason = fields.reason?.trim();
        if (!Number.isInteger(amount) || amount <= 0 || !reason) return null;
        return { amount, reason };
      },
    },
  ],
};

export const refundsConfig: ResourceConfig = {
  key: "refunds",
  title: "환불 재처리",
  description: "실패하거나 추가 조치가 필요한 환불을 재시도합니다.",
  resource: "refunds",
  columns: [
    { key: "orderId", label: "주문번호" },
    { key: "partyTitle", label: "파티" },
    { key: "amount", label: "환불액" },
    { key: "status", label: "상태" },
    { key: "lastErrorCode", label: "오류" },
    { key: "requestedAt", label: "요청일" },
  ],
  actions: [
    {
      label: "재시도",
      path: (row) => AdminApi.refundRetry(String(row.id)),
      hidden: (row) =>
        !["FAILED", "ACTION_REQUIRED", "REQUESTED"].includes(String(row.status)),
      body: () => ({}),
    },
  ],
};
