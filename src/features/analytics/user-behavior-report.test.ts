import { describe, expect, it, vi } from "vitest";
import {
  GA4_USER_ID_DIMENSION,
  MAX_PAGES,
  PAGE_LIMIT,
  buildUserBehaviorRequest,
  fetchUserBehaviorFlow,
  formatFlowDay,
  formatFlowMinute,
  parseGaMinute,
  pickUserBehaviorProperty,
  shapeUserBehaviorRows,
  type UserBehaviorRow,
} from "./user-behavior-report";

const property = { id: "5678", label: "Dopa App", platform: "mixed" as const };

function row(
  dateHourMinute: string,
  eventName: string,
  unifiedScreenName: string,
  eventCount = 1,
  platform = "iOS",
): UserBehaviorRow {
  return { dateHourMinute, eventName, unifiedScreenName, platform, eventCount };
}

function meta(overrides: Partial<Parameters<typeof shapeUserBehaviorRows>[1]> = {}) {
  return {
    timeZone: "Asia/Seoul",
    quota: null,
    dataQualityNotices: [],
    rowCount: 0,
    truncated: false,
    ...overrides,
  };
}

function gaResponse(
  rows: UserBehaviorRow[],
  rowCount: number,
  extra: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      dimensionHeaders: [
        { name: "dateHourMinute" },
        { name: "eventName" },
        { name: "unifiedScreenName" },
        { name: "platform" },
      ],
      metricHeaders: [{ name: "eventCount", type: "TYPE_INTEGER" }],
      rows: rows.map((item) => ({
        dimensionValues: [
          { value: item.dateHourMinute },
          { value: item.eventName },
          { value: item.unifiedScreenName },
          { value: item.platform },
        ],
        metricValues: [{ value: String(item.eventCount) }],
      })),
      totals: [],
      rowCount,
      metadata: { timeZone: "Asia/Seoul" },
      ...extra,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("buildUserBehaviorRequest", () => {
  it("filters one user by the registered custom dimension and orders by minute", () => {
    expect(buildUserBehaviorRequest("user-1", "7d")).toEqual({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [
        { name: "dateHourMinute" },
        { name: "eventName" },
        { name: "unifiedScreenName" },
        { name: "platform" },
      ],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "customUser:dopa_uid",
          stringFilter: { matchType: "EXACT", value: "user-1" },
        },
      },
      orderBys: [{ dimension: { dimensionName: "dateHourMinute" } }],
      limit: PAGE_LIMIT,
      offset: 0,
      returnPropertyQuota: true,
    });
    expect(GA4_USER_ID_DIMENSION).toBe("customUser:dopa_uid");
  });

  it("switches the start date for the 28-day range and carries the offset", () => {
    const request = buildUserBehaviorRequest("user-1", "28d", PAGE_LIMIT);
    expect(request.dateRanges?.[0]).toEqual({
      startDate: "28daysAgo",
      endDate: "today",
    });
    expect(request.offset).toBe(PAGE_LIMIT);
  });
});

describe("parseGaMinute", () => {
  it("reads the property's wall clock without converting time zones", () => {
    expect(parseGaMinute("202609080930")).toEqual({
      day: "2026-09-08",
      time: "09:30",
      epochMinutes: Math.floor(Date.UTC(2026, 8, 8, 9, 30) / 60_000),
    });
  });

  it("rejects anything that is not twelve calendar digits", () => {
    expect(parseGaMinute("2026090809")).toBeNull();
    expect(parseGaMinute("20260908093x")).toBeNull();
    expect(parseGaMinute("202613080930")).toBeNull();
    expect(parseGaMinute("202609082530")).toBeNull();
  });
});

describe("formatFlowMinute / formatFlowDay", () => {
  it("renders the same wall clock the parser read", () => {
    const parsed = parseGaMinute("202609080930");
    expect(formatFlowMinute(parsed?.epochMinutes ?? 0)).toBe("09:30");
    expect(formatFlowDay("2026-09-08")).toBe("2026. 09. 08.");
  });
});

describe("shapeUserBehaviorRows", () => {
  it("groups a minute's events under the first named screen", () => {
    const flow = shapeUserBehaviorRows(
      [
        row("202609080930", "screen_view", "PartyDetail", 1),
        row("202609080930", "api_mutation", "(not set)", 2),
      ],
      meta({ rowCount: 2 }),
    );

    expect(flow.sessions).toHaveLength(1);
    expect(flow.sessions[0]?.screens).toHaveLength(1);
    expect(flow.sessions[0]?.screens[0]?.screen).toBe("PartyDetail");
    expect(flow.sessions[0]?.screens[0]?.events).toEqual([
      { minute: flow.sessions[0]?.startMinute ?? 0, name: "screen_view", count: 1 },
      { minute: flow.sessions[0]?.startMinute ?? 0, name: "api_mutation", count: 2 },
    ]);
    expect(flow.totals).toEqual({ sessions: 1, events: 3, screenViews: 1 });
    expect(flow.isEmpty).toBe(false);
  });

  it("keeps a 30-minute gap in one session and breaks at 31", () => {
    const thirty = shapeUserBehaviorRows(
      [
        row("202609080900", "screen_view", "Home"),
        row("202609080930", "screen_view", "Home"),
      ],
      meta(),
    );
    const thirtyOne = shapeUserBehaviorRows(
      [
        row("202609080900", "screen_view", "Home"),
        row("202609080931", "screen_view", "Home"),
      ],
      meta(),
    );

    expect(thirty.sessions).toHaveLength(1);
    expect(thirty.sessions[0]?.durationMinutes).toBe(30);
    expect(thirtyOne.sessions).toHaveLength(2);
    expect(thirtyOne.totals.sessions).toBe(2);
  });

  it("merges consecutive minutes on the same screen and splits when it changes", () => {
    const flow = shapeUserBehaviorRows(
      [
        row("202609080900", "screen_view", "Home"),
        row("202609080901", "api_mutation", "Home"),
        row("202609080902", "screen_view", "PartyDetail"),
        row("202609080903", "screen_view", "Home"),
      ],
      meta(),
    );

    expect(flow.sessions[0]?.screens.map((visit) => visit.screen)).toEqual([
      "Home",
      "PartyDetail",
      "Home",
    ]);
    expect(flow.sessions[0]?.screens[0]?.eventCount).toBe(2);
    expect(flow.totals.screenViews).toBe(3);
  });

  it("takes the platform and day from each session's first row", () => {
    const flow = shapeUserBehaviorRows(
      [
        row("202609072350", "screen_view", "Home", 1, "Android"),
        row("202609080900", "screen_view", "Home", 1, "iOS"),
      ],
      meta(),
    );

    expect(flow.sessions[0]?.platform).toBe("Android");
    expect(flow.sessions[0]?.day).toBe("2026-09-07");
    expect(flow.sessions[1]?.platform).toBe("iOS");
    expect(flow.sessions[1]?.day).toBe("2026-09-08");
  });

  it("tracks the day the session ends on separately when it runs past midnight", () => {
    const flow = shapeUserBehaviorRows(
      [
        row("202609072350", "screen_view", "Home"),
        row("202609080010", "screen_view", "Home"),
      ],
      meta(),
    );

    expect(flow.sessions).toHaveLength(1);
    expect(flow.sessions[0]?.day).toBe("2026-09-07");
    expect(flow.sessions[0]?.endDay).toBe("2026-09-08");
  });

  it("keeps day and endDay equal for a session that stays within one day", () => {
    const flow = shapeUserBehaviorRows(
      [
        row("202609080900", "screen_view", "Home"),
        row("202609080910", "screen_view", "Home"),
      ],
      meta(),
    );

    expect(flow.sessions[0]?.day).toBe("2026-09-08");
    expect(flow.sessions[0]?.endDay).toBe("2026-09-08");
  });

  it("drops unparseable minutes and reports an empty flow rather than inventing one", () => {
    const flow = shapeUserBehaviorRows([row("nope", "screen_view", "Home")], meta());

    expect(flow.sessions).toEqual([]);
    expect(flow.isEmpty).toBe(true);
    expect(flow.totals).toEqual({ sessions: 0, events: 0, screenViews: 0 });
  });
});

describe("fetchUserBehaviorFlow", () => {
  it("stops as soon as one page covers rowCount", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(gaResponse([row("202609080900", "screen_view", "Home")], 1));

    const flow = await fetchUserBehaviorFlow({
      property,
      userId: "user-1",
      range: "7d",
      accessToken: "token",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(flow.truncated).toBe(false);
    expect(flow.rowCount).toBe(1);
    expect(flow.timeZone).toBe("Asia/Seoul");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body)).offset).toBe(0);
  });

  it("pages by offset and marks the result truncated at the page cap", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(gaResponse([row("202609080900", "screen_view", "Home")], 90_000)),
      );

    const flow = await fetchUserBehaviorFlow({
      property,
      userId: "user-1",
      range: "28d",
      accessToken: "token",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PAGES);
    expect(
      fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init.body)).offset),
    ).toEqual([0, PAGE_LIMIT, PAGE_LIMIT * 2]);
    expect(flow.truncated).toBe(true);
    expect(flow.rowCount).toBe(90_000);
  });

  it("keeps timeZone null instead of guessing Asia/Seoul when GA omits metadata.timeZone", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        gaResponse([row("202609080900", "screen_view", "Home")], 1, { metadata: {} }),
      );

    const flow = await fetchUserBehaviorFlow({
      property,
      userId: "user-1",
      range: "7d",
      accessToken: "token",
      fetchImpl,
    });

    expect(flow.timeZone).toBeNull();
  });

  it("collects GA4 quality notices once even across pages", async () => {
    const withNotice = () =>
      gaResponse([row("202609080900", "screen_view", "Home")], 90_000, {
        metadata: { timeZone: "Asia/Seoul", subjectToThresholding: true },
      });
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(withNotice()));

    const flow = await fetchUserBehaviorFlow({
      property,
      userId: "user-1",
      range: "28d",
      accessToken: "token",
      fetchImpl,
    });

    expect(flow.dataQualityNotices).toEqual([
      { reportKey: "user-behavior", reportTitle: "사용자 행동 흐름", kind: "thresholding" },
    ]);
  });
});

describe("pickUserBehaviorProperty", () => {
  it("prefers a mixed property, then a mobile one, then the first configured", () => {
    const web = { id: "1", label: "Web", platform: "web" as const };
    const android = { id: "2", label: "Android", platform: "android" as const };
    const mixed = { id: "3", label: "App", platform: "mixed" as const };

    expect(pickUserBehaviorProperty([web, android, mixed])).toBe(mixed);
    expect(pickUserBehaviorProperty([web, android])).toBe(android);
    expect(pickUserBehaviorProperty([web])).toBe(web);
    expect(pickUserBehaviorProperty([])).toBeNull();
  });
});
