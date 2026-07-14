import type { PaymentStatus, RefundStatus } from "@/generated/prisma";

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  READY: "결제 대기",
  IN_PROGRESS: "진행 중",
  DONE: "결제 완료",
  CANCELLED: "전액 취소",
  PARTIAL_CANCELLED: "부분 취소",
  ABORTED: "결제 실패",
  EXPIRED: "만료",
};

export const refundStatusLabel: Record<RefundStatus, string> = {
  REQUESTED: "환불 요청",
  REJECTED: "거절됨",
  COMPLETED: "환불 완료",
  FAILED: "환불 실패",
};

/** 결제 상태 뱃지 variant (shadcn Badge). */
export function paymentBadgeVariant(
  status: PaymentStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "DONE":
      return "secondary";
    case "CANCELLED":
    case "PARTIAL_CANCELLED":
    case "ABORTED":
      return "destructive";
    default:
      return "outline";
  }
}

/** 환불 상태 뱃지 variant. */
export function refundBadgeVariant(
  status: RefundStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "COMPLETED":
      return "secondary";
    case "REJECTED":
    case "FAILED":
      return "destructive";
    case "REQUESTED":
      return "default";
    default:
      return "outline";
  }
}
