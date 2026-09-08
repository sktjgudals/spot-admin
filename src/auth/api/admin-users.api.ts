import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { AdminApi } from "@/auth/model/admin-routes";

/**
 * SUPER_ADMIN 사용자 상세 · 요약 · 활동 타임라인.
 *
 * 이 화면은 백엔드가 아직 진화 중인 세 엔드포인트를 동시에 읽는다. 그래서
 * 모든 응답은 normalizer를 통과한다 — 필드가 하나 빠졌다고 화면 전체가
 * 흰 화면이 되면, 정작 그 사고를 조사하려고 연 화면이 못 열린다.
 *
 * 상세 응답이 `summary`를 인라인으로 실어 보내든, 별도 `/summary` 라우트로
 * 내려주든 둘 다 받는다.
 */

const DEFAULT_TIMELINE_LIMIT = 20;

export type AdminUserSession = {
  id: string;
  subjectType: string | null;
  platform: string | null;
  deviceName: string | null;
  appVersion: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type AdminUserPushToken = {
  id: string;
  platform: string | null;
  deviceId: string | null;
  appVersion: string | null;
  locale: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
};

export type AdminUserRestriction = {
  id: string;
  kind: string;
  reasonCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
  issuedBy: string | null;
};

export type AdminUserSummary = {
  profile: {
    id: string;
    nickname: string;
    email: string | null;
    profileImage: string | null;
    status: string;
    createdAt: string | null;
    lastSeenAt: string | null;
    deletedAt: string | null;
  };
  devices: {
    activeSessionCount: number;
    sessions: AdminUserSession[];
    pushTokens: AdminUserPushToken[];
  };
  counts: {
    applications: Record<string, number>;
    payments: {
      count: number;
      paidCount: number;
      paidAmount: number;
      businessCount: number;
    };
    refunds: { count: number; completedAmount: number };
    reportsFiled: number;
    reportsReceived: { total: number; pending: number };
    activeRestrictions: AdminUserRestriction[];
  };
  consent: {
    termsVersion: string | null;
    agreedAt: string | null;
    marketingOptIn: boolean;
  } | null;
  asOf: string;
};

export type AdminUserDetail = {
  id: string;
  email: string | null;
  nickname: string;
  profileImage: string | null;
  provider: string | null;
  role: string;
  status: string;
  averageRating: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  assignedBusinessId: string | null;
  /** Login is blocked for this account (distinct from `status`). */
  blocked: boolean;
  asOf: string | null;
  summary: AdminUserSummary | null;
};

export type UserTimelineRefs = {
  userId?: string;
  partyId?: string;
  businessId?: string;
  applicationId?: string;
  paymentId?: string;
  refundId?: string;
  reportId?: string;
  targetId?: string;
};

export type UserTimelineItem = {
  id: string;
  at: string;
  kind: string;
  category: string;
  title: string;
  detail: string | null;
  refs: UserTimelineRefs;
  status: string | null;
  amount: number | null;
  meta: Record<string, unknown>;
  source: string;
};

export type UserTimelineCoverageEntry = {
  category: string;
  source: string;
  retainedFrom: string | null;
  note: string;
};

export type UserTimelineCoverage = UserTimelineCoverageEntry[];

export type UserTimelinePage = {
  user: {
    id: string;
    nickname: string;
    status: string;
    deletedAt: string | null;
  };
  items: UserTimelineItem[];
  /** Opaque backend cursor. Pass it back verbatim and never parse it. */
  nextCursor: string | null;
  asOf: string | null;
  coverage: UserTimelineCoverage;
};

export type UserTimelineFilters = {
  kinds?: readonly string[];
  categories?: readonly string[];
  from?: string;
  to?: string;
};

export type UserTimelineParams = UserTimelineFilters & {
  cursor?: string;
  limit?: number;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCountMap(value: unknown): Record<string, number> {
  const source = record(value);
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(source)) {
    if (typeof count === "number" && Number.isFinite(count)) counts[key] = count;
  }
  return counts;
}

function normalizeSession(raw: unknown): AdminUserSession {
  const row = record(raw);
  return {
    id: str(row.id),
    subjectType: nullableStr(row.subjectType),
    platform: nullableStr(row.platform),
    deviceName: nullableStr(row.deviceName),
    appVersion: nullableStr(row.appVersion),
    ip: nullableStr(row.ip),
    userAgent: nullableStr(row.userAgent),
    createdAt: nullableStr(row.createdAt),
    lastUsedAt: nullableStr(row.lastUsedAt),
    expiresAt: nullableStr(row.expiresAt),
    revokedAt: nullableStr(row.revokedAt),
  };
}

function normalizePushToken(raw: unknown): AdminUserPushToken {
  const row = record(raw);
  return {
    id: str(row.id),
    platform: nullableStr(row.platform),
    deviceId: nullableStr(row.deviceId),
    appVersion: nullableStr(row.appVersion),
    locale: nullableStr(row.locale),
    createdAt: nullableStr(row.createdAt),
    lastSeenAt: nullableStr(row.lastSeenAt),
  };
}

function normalizeRestriction(raw: unknown): AdminUserRestriction {
  const row = record(raw);
  return {
    id: str(row.id),
    kind: str(row.kind, "UNKNOWN"),
    reasonCode: nullableStr(row.reasonCode),
    startsAt: nullableStr(row.startsAt),
    endsAt: nullableStr(row.endsAt),
    issuedBy: nullableStr(row.issuedBy),
  };
}

function normalizeUserSummary(raw: unknown): AdminUserSummary {
  const row = record(raw);
  const profile = record(row.profile);
  const devices = record(row.devices);
  const counts = record(row.counts);
  const payments = record(counts.payments);
  const refunds = record(counts.refunds);
  const reportsReceived = record(counts.reportsReceived);
  const consent =
    row.consent === null || row.consent === undefined ? null : record(row.consent);

  return {
    profile: {
      id: str(profile.id),
      nickname: str(profile.nickname, "이름 없음"),
      email: nullableStr(profile.email),
      profileImage: nullableStr(profile.profileImage),
      status: str(profile.status, "ACTIVE"),
      createdAt: nullableStr(profile.createdAt),
      lastSeenAt: nullableStr(profile.lastSeenAt),
      deletedAt: nullableStr(profile.deletedAt),
    },
    devices: {
      activeSessionCount: num(devices.activeSessionCount),
      sessions: list(devices.sessions).map(normalizeSession),
      pushTokens: list(devices.pushTokens).map(normalizePushToken),
    },
    counts: {
      applications: normalizeCountMap(counts.applications),
      payments: {
        count: num(payments.count),
        paidCount: num(payments.paidCount),
        paidAmount: num(payments.paidAmount),
        businessCount: num(payments.businessCount),
      },
      refunds: {
        count: num(refunds.count),
        completedAmount: num(refunds.completedAmount),
      },
      reportsFiled: num(counts.reportsFiled),
      reportsReceived: {
        total: num(reportsReceived.total),
        pending: num(reportsReceived.pending),
      },
      activeRestrictions: list(counts.activeRestrictions).map(normalizeRestriction),
    },
    consent: consent
      ? {
          termsVersion: nullableStr(consent.termsVersion),
          agreedAt: nullableStr(consent.agreedAt),
          marketingOptIn: consent.marketingOptIn === true,
        }
      : null,
    asOf: str(row.asOf),
  };
}

function normalizeAdminUser(raw: unknown): AdminUserDetail {
  const row = record(raw);
  const summary =
    row.summary === null || row.summary === undefined
      ? null
      : normalizeUserSummary(row.summary);

  return {
    id: str(row.id),
    email: nullableStr(row.email) ?? summary?.profile.email ?? null,
    nickname: str(row.nickname) || summary?.profile.nickname || "이름 없음",
    profileImage: nullableStr(row.profileImage) ?? summary?.profile.profileImage ?? null,
    provider: nullableStr(row.provider),
    role: str(row.role, "USER"),
    status: str(row.status) || summary?.profile.status || "ACTIVE",
    averageRating: nullableNum(row.averageRating),
    createdAt: nullableStr(row.createdAt) ?? summary?.profile.createdAt ?? null,
    updatedAt: nullableStr(row.updatedAt),
    assignedBusinessId: nullableStr(row.assignedBusinessId),
    blocked: row.blocked === true,
    asOf: nullableStr(row.asOf) ?? (summary ? summary.asOf || null : null),
    summary,
  };
}

const REF_KEYS = [
  "userId",
  "partyId",
  "businessId",
  "applicationId",
  "paymentId",
  "refundId",
  "reportId",
  "targetId",
] as const;

function normalizeRefs(value: unknown): UserTimelineRefs {
  const source = record(value);
  const refs: UserTimelineRefs = {};
  for (const key of REF_KEYS) {
    const id = source[key];
    if (typeof id === "string" && id !== "") refs[key] = id;
  }
  return refs;
}

function normalizeTimelineItem(raw: unknown, index: number): UserTimelineItem {
  const row = record(raw);
  const kind = str(row.kind, "UNKNOWN");
  const at = str(row.at);
  return {
    // A row without a stable id still needs a stable React key.
    id: str(row.id, `${kind}:${at}:${index}`),
    at,
    kind,
    category: str(row.category, "ACCOUNT"),
    title: str(row.title, kind),
    detail: nullableStr(row.detail),
    refs: normalizeRefs(row.refs),
    status: nullableStr(row.status),
    amount: nullableNum(row.amount),
    meta: record(row.meta),
    source: str(row.source, "db"),
  };
}

function normalizeCoverage(value: unknown): UserTimelineCoverage {
  return list(value).flatMap((entry) => {
    const row = record(entry);
    const note = str(row.note);
    // A coverage entry with nothing to say is noise in a warning banner.
    if (!note) return [];
    return [
      {
        category: str(row.category, "ALL"),
        source: str(row.source, "db"),
        retainedFrom: nullableStr(row.retainedFrom),
        note,
      },
    ];
  });
}

function normalizeTimelinePage(raw: unknown, userId: string): UserTimelinePage {
  const row = record(raw);
  const user = record(row.user);
  return {
    user: {
      id: str(user.id, userId),
      nickname: str(user.nickname, "이름 없음"),
      status: str(user.status, "ACTIVE"),
      deletedAt: nullableStr(user.deletedAt),
    },
    items: list(row.items).map((item, index) => normalizeTimelineItem(item, index)),
    nextCursor: nullableStr(row.nextCursor),
    asOf: nullableStr(row.asOf),
    coverage: normalizeCoverage(row.coverage),
  };
}

export async function getAdminUser(userId: string): Promise<AdminUserDetail> {
  const row = await adminFetchJson<unknown>(AdminApi.user(userId));
  return normalizeAdminUser(row);
}

/**
 * 요약은 없어도 화면이 열려야 한다.
 *
 * 탈퇴한 계정은 상세 라우트가 404를 주면서 요약만 남아 있을 수 있고, 반대로
 * 요약 프로젝션이 아직 안 만들어진 계정도 있다. 404는 값이 없다는 사실이지
 * 오류가 아니다.
 */
export async function getAdminUserSummary(
  userId: string,
): Promise<AdminUserSummary | null> {
  try {
    const row = await adminFetchJson<unknown>(AdminApi.userSummary(userId));
    return normalizeUserSummary(row);
  } catch (error) {
    if (isAdminNotFound(error)) return null;
    throw error;
  }
}

export async function getAdminUserTimeline(
  userId: string,
  params: UserTimelineParams = {},
): Promise<UserTimelinePage> {
  const query = new URLSearchParams();
  if (params.kinds && params.kinds.length > 0) {
    query.set("kinds", params.kinds.join(","));
  }
  if (params.categories && params.categories.length > 0) {
    query.set("categories", params.categories.join(","));
  }
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.cursor) query.set("cursor", params.cursor);
  query.set("limit", String(params.limit ?? DEFAULT_TIMELINE_LIMIT));

  const page = await adminFetchJson<unknown>(
    `${AdminApi.userTimeline(userId)}?${query.toString()}`,
  );
  return normalizeTimelinePage(page, userId);
}

export function isAdminNotFound(error: unknown): boolean {
  return error instanceof AdminAuthError && error.status === 404;
}

export function isAdminForbidden(error: unknown): boolean {
  return error instanceof AdminAuthError && error.status === 403;
}
