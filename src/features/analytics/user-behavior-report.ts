import {
  runAnalyticsReport,
  type AnalyticsDataApiOptions,
  type AnalyticsReportResponse,
  type AnalyticsRunReportRequest,
} from "./analytics-data-api";
import { dataQualityNoticesForReport } from "./analytics-reports";
import type {
  AnalyticsDataQualityNotice,
  AnalyticsPropertyConfig,
  AnalyticsQuotaState,
} from "./types";

/**
 * 한 사용자의 앱 화면 흐름.
 *
 * GA4는 "이 사람이 무엇을 했는가"를 사용자 범위 맞춤 측정기준으로만 좁힐 수
 * 있다. 앱이 로그인 시 보내는 `dopa_uid` 사용자 속성이 GA4에 맞춤 측정기준으로
 * 등록되어 있어야 하고, 등록 이후에 수집된 이벤트만 조회된다.
 *
 * 여기서 만드는 건 GA4 보고서가 아니라 "세션 → 화면 → 이벤트" 형태의 흐름이다.
 * GA4에는 세션 경계가 이 분 단위 보고서에 실려오지 않으므로 30분 무활동을
 * 경계로 삼는다 — GA4 자체 세션 정의와 같은 기준이다.
 */

export const GA4_USER_ID_DIMENSION = "customUser:dopa_uid";
export const USER_BEHAVIOR_RANGES = ["7d", "28d"] as const;
export type UserBehaviorRange = (typeof USER_BEHAVIOR_RANGES)[number];

/** 30분을 "넘는" 공백이 새 세션을 연다. 정확히 30분은 같은 세션이다. */
export const SESSION_GAP_MINUTES = 30;
export const PAGE_LIMIT = 10_000;
export const MAX_PAGES = 3;

const REPORT_DEFINITION = {
  key: "user-behavior",
  title: "사용자 행동 흐름",
} as const;

const NOT_SET = "(not set)";
const SCREEN_VIEW_EVENT = "screen_view";

export type UserBehaviorRow = {
  dateHourMinute: string;
  eventName: string;
  unifiedScreenName: string;
  platform: string;
  eventCount: number;
};

export type GaMinute = { day: string; time: string; epochMinutes: number };

export type UserBehaviorEvent = { minute: number; name: string; count: number };

export type UserBehaviorScreenVisit = {
  screen: string;
  startMinute: number;
  endMinute: number;
  events: UserBehaviorEvent[];
  eventCount: number;
};

export type UserBehaviorSession = {
  id: string;
  platform: string;
  day: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  screens: UserBehaviorScreenVisit[];
  eventCount: number;
};

export type UserBehaviorFlow = {
  timeZone: string;
  sessions: UserBehaviorSession[];
  totals: { sessions: number; events: number; screenViews: number };
  dataQualityNotices: AnalyticsDataQualityNotice[];
  quota: AnalyticsQuotaState | null;
  /** GA4's own total, independent of what this request retrieved. */
  rowCount: number;
  truncated: boolean;
  isEmpty: boolean;
};

export type UserBehaviorFlowMeta = {
  timeZone: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  rowCount: number;
  truncated: boolean;
};

export function buildUserBehaviorRequest(
  userId: string,
  range: UserBehaviorRange,
  offset = 0,
): AnalyticsRunReportRequest {
  return {
    dateRanges: [
      {
        startDate: range === "7d" ? "7daysAgo" : "28daysAgo",
        // `today` on purpose: an operator investigating a report filed an hour
        // ago needs today's rows, incomplete as GA4 processing makes them.
        endDate: "today",
      },
    ],
    dimensions: [
      { name: "dateHourMinute" },
      { name: "eventName" },
      { name: "unifiedScreenName" },
      { name: "platform" },
    ],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: GA4_USER_ID_DIMENSION,
        stringFilter: { matchType: "EXACT", value: userId },
      },
    },
    orderBys: [{ dimension: { dimensionName: "dateHourMinute" } }],
    limit: PAGE_LIMIT,
    offset,
    returnPropertyQuota: true,
  };
}

/**
 * `YYYYMMDDHHmm` → the property's own wall clock.
 *
 * No time-zone conversion happens here or anywhere downstream: GA4 already
 * reports in the property's configured zone, and re-projecting it into the
 * browser's zone would silently move every timestamp for an operator abroad.
 * `epochMinutes` is built with `Date.UTC` purely as a monotonic minute counter.
 */
export function parseGaMinute(value: string): GaMinute | null {
  if (!/^\d{12}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  return {
    day: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
    time: `${value.slice(8, 10)}:${value.slice(10, 12)}`,
    epochMinutes: Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 60_000),
  };
}

export function formatFlowMinute(epochMinutes: number): string {
  const date = new Date(epochMinutes * 60_000);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatFlowDay(day: string): string {
  const [year, month, date] = day.split("-");
  return year && month && date ? `${year}. ${month}. ${date}.` : day;
}

type MinuteBucket = {
  epochMinutes: number;
  day: string;
  screen: string;
  platform: string;
  events: UserBehaviorEvent[];
  eventCount: number;
  screenViews: number;
};

function bucketRowsByMinute(rows: readonly UserBehaviorRow[]): MinuteBucket[] {
  const buckets = new Map<number, MinuteBucket>();

  for (const row of rows) {
    const parsed = parseGaMinute(row.dateHourMinute);
    if (!parsed) continue;

    let bucket = buckets.get(parsed.epochMinutes);
    if (!bucket) {
      bucket = {
        epochMinutes: parsed.epochMinutes,
        day: parsed.day,
        screen: NOT_SET,
        platform: "",
        events: [],
        eventCount: 0,
        screenViews: 0,
      };
      buckets.set(parsed.epochMinutes, bucket);
    }

    // The first named screen wins: GA4 stamps "(not set)" on events that fired
    // between screens, and letting those overwrite the screen name would turn a
    // readable flow into a column of "(not set)".
    if (bucket.screen === NOT_SET && row.unifiedScreenName && row.unifiedScreenName !== NOT_SET) {
      bucket.screen = row.unifiedScreenName;
    }
    if (!bucket.platform && row.platform) bucket.platform = row.platform;

    const count = Number.isFinite(row.eventCount) ? row.eventCount : 0;
    const existing = bucket.events.find((event) => event.name === row.eventName);
    if (existing) existing.count += count;
    else bucket.events.push({ minute: parsed.epochMinutes, name: row.eventName, count });

    bucket.eventCount += count;
    if (row.eventName === SCREEN_VIEW_EVENT) bucket.screenViews += count;
  }

  return [...buckets.values()].sort((a, b) => a.epochMinutes - b.epochMinutes);
}

export function shapeUserBehaviorRows(
  rows: readonly UserBehaviorRow[],
  meta: UserBehaviorFlowMeta,
): UserBehaviorFlow {
  const buckets = bucketRowsByMinute(rows);
  const sessions: UserBehaviorSession[] = [];
  let events = 0;
  let screenViews = 0;

  for (const bucket of buckets) {
    events += bucket.eventCount;
    screenViews += bucket.screenViews;

    const current = sessions.at(-1);
    const gap = current ? bucket.epochMinutes - current.endMinute : Number.POSITIVE_INFINITY;

    if (!current || gap > SESSION_GAP_MINUTES) {
      sessions.push({
        id: `session-${bucket.epochMinutes}`,
        platform: bucket.platform || "unknown",
        day: bucket.day,
        startMinute: bucket.epochMinutes,
        endMinute: bucket.epochMinutes,
        durationMinutes: 0,
        screens: [
          {
            screen: bucket.screen,
            startMinute: bucket.epochMinutes,
            endMinute: bucket.epochMinutes,
            events: [...bucket.events],
            eventCount: bucket.eventCount,
          },
        ],
        eventCount: bucket.eventCount,
      });
      continue;
    }

    current.endMinute = bucket.epochMinutes;
    current.durationMinutes = current.endMinute - current.startMinute;
    current.eventCount += bucket.eventCount;

    const visit = current.screens.at(-1);
    if (visit && visit.screen === bucket.screen) {
      visit.endMinute = bucket.epochMinutes;
      visit.events.push(...bucket.events);
      visit.eventCount += bucket.eventCount;
    } else {
      current.screens.push({
        screen: bucket.screen,
        startMinute: bucket.epochMinutes,
        endMinute: bucket.epochMinutes,
        events: [...bucket.events],
        eventCount: bucket.eventCount,
      });
    }
  }

  return {
    timeZone: meta.timeZone,
    sessions,
    totals: { sessions: sessions.length, events, screenViews },
    dataQualityNotices: meta.dataQualityNotices,
    quota: meta.quota,
    rowCount: meta.rowCount,
    truncated: meta.truncated,
    isEmpty: sessions.length === 0,
  };
}

function toUserBehaviorRows(report: AnalyticsReportResponse): UserBehaviorRow[] {
  const dimensionIndex = new Map(
    report.dimensionHeaders.map((header, index) => [header.name, index] as const),
  );
  const metricIndex = report.metricHeaders.findIndex(
    (header) => header.name === "eventCount",
  );

  const dimension = (
    row: AnalyticsReportResponse["rows"][number],
    name: string,
  ): string => {
    const index = dimensionIndex.get(name);
    return index === undefined ? "" : (row.dimensionValues[index]?.value ?? "");
  };

  return report.rows.flatMap((row) => {
    const dateHourMinute = dimension(row, "dateHourMinute");
    if (!dateHourMinute) return [];
    const count = Number(row.metricValues[metricIndex]?.value ?? "0");
    return [
      {
        dateHourMinute,
        eventName: dimension(row, "eventName"),
        unifiedScreenName: dimension(row, "unifiedScreenName"),
        platform: dimension(row, "platform"),
        eventCount: Number.isFinite(count) ? count : 0,
      },
    ];
  });
}

function quotaFromResponses(
  responses: readonly AnalyticsReportResponse[],
): AnalyticsQuotaState | null {
  const byKey = new Map<string, { consumed: number; remaining: number }>();
  for (const response of responses) {
    for (const [key, entry] of Object.entries(response.propertyQuota ?? {})) {
      const existing = byKey.get(key);
      byKey.set(key, {
        consumed: Math.max(existing?.consumed ?? 0, entry.consumed),
        remaining: Math.min(existing?.remaining ?? Number.MAX_SAFE_INTEGER, entry.remaining),
      });
    }
  }
  if (byKey.size === 0) return null;
  return {
    entries: [...byKey]
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function dedupeNotices(
  notices: readonly AnalyticsDataQualityNotice[],
): AnalyticsDataQualityNotice[] {
  const seen = new Set<string>();
  return notices.filter((notice) => {
    const key = JSON.stringify(notice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchUserBehaviorFlow(input: {
  property: AnalyticsPropertyConfig;
  userId: string;
  range: UserBehaviorRange;
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: AnalyticsDataApiOptions["fetchImpl"];
}): Promise<UserBehaviorFlow> {
  const rows: UserBehaviorRow[] = [];
  const responses: AnalyticsReportResponse[] = [];
  const notices: AnalyticsDataQualityNotice[] = [];
  let rowCount = 0;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const response = await runAnalyticsReport(
      input.property.id,
      buildUserBehaviorRequest(input.userId, input.range, offset),
      {
        accessToken: input.accessToken,
        signal: input.signal,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      },
    );

    responses.push(response);
    notices.push(...dataQualityNoticesForReport(response, REPORT_DEFINITION));
    rows.push(...toUserBehaviorRows(response));
    rowCount = response.rowCount;

    if (response.rows.length === 0) break;
    if (rowCount <= offset + PAGE_LIMIT) break;
    // More rows exist than this cap will read. Say so rather than let the
    // screen imply the user simply stopped using the app at that minute.
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return shapeUserBehaviorRows(rows, {
    timeZone: responses.at(-1)?.metadata?.timeZone ?? "Asia/Seoul",
    quota: quotaFromResponses(responses),
    dataQualityNotices: dedupeNotices(notices),
    rowCount,
    truncated,
  });
}

/**
 * 이 화면이 볼 속성 하나를 고른다.
 *
 * 사용자 행동은 앱에서 일어난다. web 전용 속성을 기본값으로 잡으면 "데이터
 * 없음"이 기본 화면이 된다.
 */
export function pickUserBehaviorProperty(
  properties: readonly AnalyticsPropertyConfig[],
): AnalyticsPropertyConfig | null {
  return (
    properties.find((property) => property.platform === "mixed") ??
    properties.find(
      (property) => property.platform === "android" || property.platform === "ios",
    ) ??
    properties[0] ??
    null
  );
}
