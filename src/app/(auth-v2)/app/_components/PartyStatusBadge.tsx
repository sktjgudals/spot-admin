"use client";

import type { PartyOperationalStatus } from "@/auth/api/admin-party.api";
import { Badge } from "@/components/ui/badge";

export const PARTY_STATUS_LABELS: Record<PartyOperationalStatus, string> = {
  DRAFT: "대기",
  RECRUITING: "모집 중",
  CONFIRMED: "참가 확정",
  CHECKIN_OPEN: "체크인",
  LIVE: "진행 중",
  INTEREST_OPEN: "호감 선택",
  INTEREST_CLOSED: "호감 마감",
  MATCH_PENDING: "매칭 계산",
  MATCH_REVEALED: "매칭 공개",
  AFTER_PARTY: "애프터파티",
  COMPLETED: "종료",
  CANCELLED: "취소",
};

export function PartyStatusBadge({ status }: { status: PartyOperationalStatus }) {
  return (
    <Badge
      variant={
        status === "COMPLETED" || status === "CANCELLED"
          ? "outline"
          : "default"
      }
    >
      {PARTY_STATUS_LABELS[status]}
    </Badge>
  );
}
