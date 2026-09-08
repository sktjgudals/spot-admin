import {
  Ban,
  Bell,
  Briefcase,
  CalendarCheck,
  Circle,
  ClipboardCheck,
  CreditCard,
  Flag,
  Heart,
  LogIn,
  LogOut,
  MessageCircle,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Star,
  Ticket,
  Undo2,
  UserMinus,
  UserPlus,
  UserRoundCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  UserTimelineCoverage,
  UserTimelineItem,
  UserTimelineRefs,
} from "@/auth/api/admin-users.api";
import {
  businessDetailPath,
  businessPartyDetailPath,
  superAdminUserDetailPath,
} from "@/auth/model/admin-routes";
import { formatDateOnly, formatDayLabel } from "@/lib/format-date";

/**
 * 타임라인의 순수 규칙.
 *
 * `kinds`는 서버 필터로 보내는 힌트이고, 화면에 무엇을 보일지는 서버가 각 행에
 * 실어주는 `category`로 정한다. 백엔드가 kind를 하나 추가했는데 이 목록에 없다는
 * 이유로 그 행이 화면에서 사라지면, 하필 그 새 사건을 조사하러 온 운영자가 아무
 * 것도 못 본다.
 *
 * 카테고리·kind 목록과 한글 라벨은 백엔드 `TIMELINE_KIND_NAMES`(39개, 8개
 * 카테고리)와 조정된 값을 그대로 쓴다.
 */

export const TIMELINE_CATEGORIES = [
  {
    value: "ACCOUNT",
    label: "계정",
    kinds: [
      "ACCOUNT_CREATED",
      "ACCOUNT_WITHDRAWN",
      "CONSENT_AGREED",
      "BUSINESS_ROLE_APPLIED",
      "BUSINESS_ROLE_REVIEWED",
      "BUSINESS_ROLE_GRANTED",
      "STAFF_ASSIGNED",
      "STAFF_REVOKED",
    ],
  },
  {
    value: "SESSION",
    label: "접속",
    kinds: ["SESSION_CREATED", "SESSION_REVOKED"],
  },
  {
    value: "PARTY",
    label: "파티",
    kinds: [
      "APPLICATION_SUBMITTED",
      "APPLICATION_APPROVED",
      "APPLICATION_REJECTED",
      "APPLICATION_CANCELED",
      "WISHLIST_ADDED",
      "REVIEW_POSTED",
      "PARTY_RATED",
      "PEER_REVIEW_RECEIVED",
      "BUSINESS_REVIEW_RECEIVED",
    ],
  },
  {
    value: "PAYMENT",
    label: "결제",
    kinds: [
      "PAYMENT_CREATED",
      "PAYMENT_APPROVED",
      "PAYMENT_CANCELLED",
      "REFUND_REQUESTED",
      "REFUND_DECIDED",
      "COUPON_ISSUED",
      "COUPON_REVOKED",
      "COUPON_REDEEMED",
      "COUPON_REVERSED",
    ],
  },
  {
    value: "SOCIAL",
    label: "소셜",
    kinds: ["USER_FOLLOWED", "USER_BLOCKED", "BUSINESS_FOLLOWED", "BLOCKED_BY_BUSINESS"],
  },
  {
    value: "MODERATION",
    label: "신고·제재",
    kinds: [
      "REPORT_FILED",
      "REPORT_FILED_RESOLVED",
      "RESTRICTION_ISSUED",
      "REPORT_RECEIVED",
      "REPORT_RECEIVED_RESOLVED",
    ],
  },
  {
    value: "ADMIN",
    label: "관리자",
    kinds: ["ADMIN_ACTION"],
  },
  {
    value: "NOTIFICATION",
    label: "알림",
    kinds: ["NOTIFICATION_SENT"],
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  kinds: readonly string[];
}>;

export const TIMELINE_KIND_LABELS: Record<string, string> = {
  ACCOUNT_CREATED: "가입",
  ACCOUNT_WITHDRAWN: "탈퇴",
  CONSENT_AGREED: "약관 동의",
  BUSINESS_ROLE_APPLIED: "업체 권한 신청",
  BUSINESS_ROLE_REVIEWED: "업체 권한 심사",
  BUSINESS_ROLE_GRANTED: "업체 운영 권한 부여",
  STAFF_ASSIGNED: "파티 스태프 배정",
  STAFF_REVOKED: "파티 스태프 해제",
  SESSION_CREATED: "로그인",
  SESSION_REVOKED: "세션 종료",
  APPLICATION_SUBMITTED: "파티 신청",
  APPLICATION_APPROVED: "신청 승인",
  APPLICATION_REJECTED: "신청 거절",
  APPLICATION_CANCELED: "신청 취소",
  WISHLIST_ADDED: "파티 찜",
  REVIEW_POSTED: "후기 작성",
  PARTY_RATED: "파티 평가",
  PEER_REVIEW_RECEIVED: "참가자 후기 받음",
  BUSINESS_REVIEW_RECEIVED: "업체 평가 받음",
  PAYMENT_CREATED: "결제 시작",
  PAYMENT_APPROVED: "결제 완료",
  PAYMENT_CANCELLED: "결제 취소",
  REFUND_REQUESTED: "환불 요청",
  REFUND_DECIDED: "환불 처리",
  COUPON_ISSUED: "쿠폰 발급",
  COUPON_REVOKED: "쿠폰 회수",
  COUPON_REDEEMED: "쿠폰 사용",
  COUPON_REVERSED: "쿠폰 사용 취소",
  USER_FOLLOWED: "사용자 팔로우",
  USER_BLOCKED: "사용자 차단",
  BUSINESS_FOLLOWED: "업체 팔로우",
  BLOCKED_BY_BUSINESS: "업체가 차단",
  REPORT_FILED: "신고 접수(신고자)",
  REPORT_FILED_RESOLVED: "신고 처리 완료(신고자)",
  RESTRICTION_ISSUED: "제재 부과",
  REPORT_RECEIVED: "신고당함",
  REPORT_RECEIVED_RESOLVED: "신고 처리 결과",
  ADMIN_ACTION: "관리자 조치",
  NOTIFICATION_SENT: "알림 발송",
};

export const TIMELINE_KIND_ICONS: Record<string, LucideIcon> = {
  ACCOUNT_CREATED: UserPlus,
  ACCOUNT_WITHDRAWN: UserMinus,
  CONSENT_AGREED: CalendarCheck,
  BUSINESS_ROLE_APPLIED: Briefcase,
  BUSINESS_ROLE_REVIEWED: ClipboardCheck,
  BUSINESS_ROLE_GRANTED: ShieldCheck,
  STAFF_ASSIGNED: UserPlus,
  STAFF_REVOKED: UserMinus,
  SESSION_CREATED: LogIn,
  SESSION_REVOKED: LogOut,
  APPLICATION_SUBMITTED: CalendarCheck,
  APPLICATION_APPROVED: CalendarCheck,
  APPLICATION_REJECTED: CalendarCheck,
  APPLICATION_CANCELED: CalendarCheck,
  WISHLIST_ADDED: Heart,
  REVIEW_POSTED: MessageCircle,
  PARTY_RATED: Star,
  PEER_REVIEW_RECEIVED: MessageCircle,
  BUSINESS_REVIEW_RECEIVED: MessageCircle,
  PAYMENT_CREATED: CreditCard,
  PAYMENT_APPROVED: CreditCard,
  PAYMENT_CANCELLED: Receipt,
  REFUND_REQUESTED: Undo2,
  REFUND_DECIDED: Undo2,
  COUPON_ISSUED: Ticket,
  COUPON_REVOKED: Ticket,
  COUPON_REDEEMED: Ticket,
  COUPON_REVERSED: Ticket,
  USER_FOLLOWED: Users,
  USER_BLOCKED: Ban,
  BUSINESS_FOLLOWED: Users,
  BLOCKED_BY_BUSINESS: Ban,
  REPORT_FILED: Flag,
  REPORT_FILED_RESOLVED: Flag,
  RESTRICTION_ISSUED: ShieldAlert,
  REPORT_RECEIVED: Flag,
  REPORT_RECEIVED_RESOLVED: Flag,
  ADMIN_ACTION: UserRoundCog,
  NOTIFICATION_SENT: Bell,
};

export const TIMELINE_SOURCE_LABELS: Record<string, string> = {
  db: "DB",
  audit: "감사 로그",
  projection: "프로젝션",
};

export const TIMELINE_PERIODS = [
  { value: "7d", label: "최근 7일", days: 7 },
  { value: "28d", label: "최근 28일", days: 28 },
  { value: "90d", label: "최근 90일", days: 90 },
  { value: "all", label: "전체", days: null },
] as const;

export type TimelinePeriod = (typeof TIMELINE_PERIODS)[number]["value"];

export type TimelineDayGroup = {
  day: string;
  label: string;
  items: UserTimelineItem[];
};

export type TimelineRefKind =
  | "user"
  | "business"
  | "party"
  | "application"
  | "payment"
  | "refund"
  | "report"
  | "target";

export type TimelineRef = {
  kind: TimelineRefKind;
  id: string;
  businessId: string | null;
};

export const TIMELINE_REF_LABELS: Record<TimelineRefKind, string> = {
  user: "사용자",
  business: "업체",
  party: "파티",
  application: "신청",
  payment: "결제",
  refund: "환불",
  report: "신고",
  target: "대상",
};

const DAY_MS = 86_400_000;

const seoulDayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function timelineCategoryLabel(value: string): string {
  return TIMELINE_CATEGORIES.find((entry) => entry.value === value)?.label ?? value;
}

export function timelineKindLabel(kind: string): string {
  return TIMELINE_KIND_LABELS[kind] ?? kind;
}

export function timelineKindIcon(kind: string): LucideIcon {
  return TIMELINE_KIND_ICONS[kind] ?? Circle;
}

export function timelineFromIso(period: TimelinePeriod, now: number): string | null {
  const days = TIMELINE_PERIODS.find((option) => option.value === period)?.days ?? null;
  return days === null ? null : new Date(now - days * DAY_MS).toISOString();
}

/** `undefined` means "send no kind filter", not "send an empty one". */
export function kindsForCategories(
  categories: readonly string[],
): readonly string[] | undefined {
  if (categories.length === 0) return undefined;
  const kinds = TIMELINE_CATEGORIES.filter((entry) =>
    categories.includes(entry.value),
  ).flatMap((entry) => [...entry.kinds]);
  return kinds.length > 0 ? [...new Set(kinds)] : undefined;
}

export function filterTimelineItems(
  items: readonly UserTimelineItem[],
  categories: readonly string[],
): UserTimelineItem[] {
  if (categories.length === 0) return [...items];
  const selected = new Set(categories);
  const kinds = new Set(kindsForCategories(categories) ?? []);
  return items.filter((item) => selected.has(item.category) || kinds.has(item.kind));
}

/**
 * 서버가 준 최신순 그대로 하루씩 묶는다.
 *
 * 날짜 경계는 Asia/Seoul이다. UTC로 자르면 밤 9시 이후의 활동이 전부 "내일"로
 * 넘어가서, 어젯밤 사건을 찾는 운영자가 오늘 칸을 뒤지게 된다.
 */
export function groupTimelineByDay(
  items: readonly UserTimelineItem[],
): TimelineDayGroup[] {
  const groups: TimelineDayGroup[] = [];
  for (const item of items) {
    const parsed = new Date(item.at);
    const valid = !Number.isNaN(parsed.getTime());
    const day = valid ? seoulDayKey.format(parsed) : "unknown";
    const current = groups.at(-1);
    if (current && current.day === day) {
      current.items.push(item);
      continue;
    }
    groups.push({
      day,
      label: valid ? formatDayLabel(parsed) : "시각을 알 수 없는 활동",
      items: [item],
    });
  }
  return groups;
}

export function timelineRefsOf(refs: UserTimelineRefs | undefined): TimelineRef[] {
  if (!refs) return [];
  const businessId = refs.businessId ?? null;
  const entries: Array<[TimelineRefKind, string | undefined]> = [
    ["user", refs.userId],
    ["business", refs.businessId],
    ["party", refs.partyId],
    ["application", refs.applicationId],
    ["payment", refs.paymentId],
    ["refund", refs.refundId],
    ["report", refs.reportId],
    ["target", refs.targetId],
  ];
  return entries.flatMap(([kind, id]) => (id ? [{ kind, id, businessId }] : []));
}

/**
 * 링크는 실제로 열리는 것만 만든다.
 *
 * 파티 상세는 소유 업체 경로 안에 있어서 businessId 없이는 주소를 만들 수 없고,
 * 신고에는 개별 URL이 없다. 없는 주소를 추측해 링크로 만들면 조사 중인 사람이
 * 404를 밟는다 — 그 순간 이 화면 전체가 못 믿을 화면이 된다.
 */
export function timelineRefHref(ref: TimelineRef): string | null {
  if (ref.kind === "user") return superAdminUserDetailPath(ref.id);
  if (ref.kind === "business") return businessDetailPath(ref.id);
  if (ref.kind === "party") {
    return ref.businessId ? businessPartyDetailPath(ref.businessId, ref.id) : null;
  }
  if (ref.kind === "payment") {
    return `/super-admin/payments?payments_q=${encodeURIComponent(ref.id)}`;
  }
  if (ref.kind === "refund") {
    return `/super-admin/payments?refunds_q=${encodeURIComponent(ref.id)}`;
  }
  return null;
}

export function coverageSummaryText({
  from,
  asOf,
  coverage,
  categories,
}: {
  from: string | null;
  asOf: string | null;
  coverage: UserTimelineCoverage;
  categories: readonly string[];
}): string {
  const start = from ? formatDateOnly(from) : "서비스 시작";
  const end = asOf ? formatDateOnly(asOf) : "현재";
  const labels =
    coverage.length > 0
      ? coverage.map((entry) => timelineCategoryLabel(entry.category))
      : categories.length > 0
        ? categories.map(timelineCategoryLabel)
        : TIMELINE_CATEGORIES.map((entry) => entry.label);
  return `${start}–${end} 기간의 ${[...new Set(labels)].join("·")}를 포함합니다`;
}
