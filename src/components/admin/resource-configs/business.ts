import type { ResourceConfig } from "./types";

export const businessRoleRequestsConfig: ResourceConfig = {
  key: "business-role-requests",
  title: "업체 권한 신청",
  description: "앱에서 접수된 업체 관리자 권한 신청을 검토합니다.",
  resource: "business-role-requests",
  statusOptions: [
    { value: "PENDING", label: "검토 대기" },
    { value: "APPROVED", label: "승인" },
    { value: "REJECTED", label: "거절" },
  ],
  columns: [
    { key: "nickname", label: "신청자" },
    { key: "email", label: "이메일" },
    { key: "businessName", label: "업체명" },
    { key: "reason", label: "신청 사유" },
    { key: "status", label: "상태" },
    { key: "createdAt", label: "신청일" },
  ],
  actions: [
    {
      label: "승인",
      path: (row) =>
        `/admin/v2/business-role-requests/${encodeURIComponent(String(row.id))}/approve`,
      hidden: (row) => row.status !== "PENDING",
      body: () => ({}),
    },
    {
      label: "거절",
      path: (row) =>
        `/admin/v2/business-role-requests/${encodeURIComponent(String(row.id))}/reject`,
      hidden: (row) => row.status !== "PENDING",
      destructive: true,
      confirm: { reason: { label: "거절 사유", required: true } },
      body: (_row, fields) =>
        fields.reason?.trim() ? { reason: fields.reason.trim() } : null,
    },
  ],
};
