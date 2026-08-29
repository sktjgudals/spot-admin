import { adminFetchJson, type AdminFetchInit } from "@/auth/api/admin-http";

/**
 * The moderation queue.
 *
 * Separate from `admin-resources.api` because reports are not one of the
 * generic `admin_resource_snapshots` types: they have their own projection,
 * their own deadline, and a resolve action with side effects (content removed,
 * account suspended) that the generic console has no vocabulary for.
 */

export type ReportStatus = "PENDING" | "ACTIONED" | "DISMISSED";
export type ReportResolution =
  | "CONTENT_REMOVED"
  | "USER_SUSPENDED"
  | "DISMISSED";

export interface AdminReport {
  reportId: string;
  reporterUserId: string;
  reporterNickname: string | null;
  targetKind: string;
  targetId: string;
  targetNickname: string | null;
  conversationId: string | null;
  businessId: string | null;
  reasonCode: string;
  status: ReportStatus;
  createdAt: string;
  dueAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: ReportResolution | null;
  resolutionNote: string | null;
  /** Open past its 24-hour deadline. The server decides; the UI only shows it. */
  overdue: boolean;
}

export interface AdminReportPage {
  items: AdminReport[];
  nextCursor: string | null;
  openCount: number;
  overdueCount: number;
  slaHours: number;
  asOf: string;
}

export interface AdminReportDetail extends AdminReport {
  /** The reporter's own words. Read one report at a time, never in the list. */
  note: string | null;
  targetHistory: AdminReport[];
  content: {
    kind: string;
    id: string;
    partyId: string;
    authorId: string;
    body: string;
    imageUrls: string;
    createdAt: string;
  } | null;
}

export async function listAdminReports(
  params: { status?: ReportStatus; offset?: number; limit?: number } = {},
): Promise<AdminReportPage> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.offset) query.set("offset", String(params.offset));
  query.set("limit", String(params.limit ?? 50));
  return adminFetchJson<AdminReportPage>(
    `/admin/v2/reports?${query.toString()}`,
  );
}

export function getAdminReport(reportId: string): Promise<AdminReportDetail> {
  return adminFetchJson<AdminReportDetail>(
    `/admin/v2/reports/${encodeURIComponent(reportId)}`,
  );
}

export function resolveAdminReport(
  reportId: string,
  body: { resolution: ReportResolution; note?: string },
): Promise<AdminReport> {
  const init: AdminFetchInit = {
    method: "POST",
    body: JSON.stringify(body),
  };
  return adminFetchJson<AdminReport>(
    `/admin/v2/reports/${encodeURIComponent(reportId)}/resolve`,
    init,
  );
}

/**
 * 신고 알림 Slack 연결 확인.
 *
 * 알림 경로는 실패해도 신고를 죽이지 않도록 조용히 설계돼 있다. 그래서
 * 웹훅을 잘못 붙여넣어도 아무 일도 일어나지 않고, 설정한 사람은 그걸 알
 * 방법이 없다. 이 호출이 그 침묵을 깬다.
 */
export function testModerationAlert(): Promise<{
  configured: boolean;
  usable: boolean;
  delivered: boolean;
  hint?: string;
}> {
  const init: AdminFetchInit = { method: "POST" };
  return adminFetchJson("/admin/v2/reports/test-alert", init);
}

/** Korean labels for the codes the app sends. Unknown codes show as-is. */
export const REASON_LABELS: Record<string, string> = {
  HARASSMENT: "괴롭힘 / 폭언",
  FAKE_PROFILE: "허위 프로필",
  INAPPROPRIATE_CONTENT: "부적절한 사진 / 내용",
  NO_SHOW: "노쇼",
  SPAM: "스팸 / 광고",
  OTHER: "기타",
};

export const TARGET_KIND_LABELS: Record<string, string> = {
  USER: "사용자",
  BUSINESS: "업체",
  CONVERSATION: "대화방",
  MESSAGE: "메시지",
  REVIEW_POST: "후기 게시글",
  PARTY: "파티",
};

export const RESOLUTION_LABELS: Record<ReportResolution, string> = {
  CONTENT_REMOVED: "콘텐츠 삭제",
  USER_SUSPENDED: "계정 정지",
  DISMISSED: "기각",
};
