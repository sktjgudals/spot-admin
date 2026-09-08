import { describe, expect, it } from "vitest";
import { buildInsights } from "./analytics-insights";
import type { AnalyticsMetricValue, AnalyticsPlatformBreakdown } from "./types";

function metric(
  key: string,
  label: string,
  value: number,
  previousValue: number,
  format: AnalyticsMetricValue["format"] = "integer",
): AnalyticsMetricValue {
  return { key, label, value, previousValue, format };
}

function platform(
  name: string,
  currentUsers: number,
  previousUsers: number,
): AnalyticsPlatformBreakdown {
  return {
    platform: name,
    current: { activeUsers: currentUsers, newUsers: 0, sessions: 0 },
    previous: { activeUsers: previousUsers, newUsers: 0, sessions: 0 },
  };
}

/**
 * A healthy base that did not move. Present in every focused case so the
 * "비교 기준이 작아…" fallback — which fires only when nothing else did *and*
 * the previous activeUsers base is under 50 — stays out of the assertion.
 */
const STABLE_BASE = metric("activeUsers", "활성 사용자", 100, 100);

function build(
  metrics: AnalyticsMetricValue[],
  platforms: AnalyticsPlatformBreakdown[] = [],
) {
  return buildInsights({ metrics, platforms, currencyCode: "KRW" });
}

describe("total-metric rules", () => {
  it("fires at exactly 20% and stays quiet at 19%", () => {
    expect(
      build([metric("activeUsers", "활성 사용자", 120, 100)])[0],
    ).toMatchObject({
      id: "total:activeUsers",
      severity: "positive",
      text: "활성 사용자 20% 증가 (100 → 120)",
    });
    expect(build([metric("activeUsers", "활성 사용자", 119, 100)])).toEqual([]);
  });

  it("needs a base of at least 50 previous users", () => {
    expect(
      build([STABLE_BASE, metric("newUsers", "신규 사용자", 100, 49)]),
    ).toEqual([]);
    expect(
      build([STABLE_BASE, metric("newUsers", "신규 사용자", 100, 50)]),
    ).toHaveLength(1);
  });

  it("writes a fall the way an operator reads it", () => {
    expect(
      build([STABLE_BASE, metric("newUsers", "신규 사용자", 843, 1240)])[0],
    ).toMatchObject({
      severity: "warning",
      text: "신규 사용자 32% 감소 (1,240 → 843)",
      metric: "newUsers",
      scope: "total",
      current: 843,
      previous: 1240,
    });
  });

  it("measures engagement rate in percentage points, not percent", () => {
    expect(
      build([
        STABLE_BASE,
        metric("engagementRate", "참여율", 0.512, 0.574, "percent"),
      ])[0],
    ).toMatchObject({ severity: "warning", text: "참여율 6.2%p 하락" });
    expect(
      build([
        STABLE_BASE,
        metric("engagementRate", "참여율", 0.54, 0.574, "percent"),
      ]),
    ).toEqual([]);
  });

  it("formats revenue as money and needs only a non-zero base", () => {
    expect(
      build([
        STABLE_BASE,
        metric("totalRevenue", "총수익", 30_000, 25_000, "currency"),
      ])[0],
    ).toMatchObject({
      severity: "positive",
      text: "총수익 20% 증가 (₩25,000 → ₩30,000)",
    });
  });
});

describe("platform rules", () => {
  it("fires at 25% once the platform had at least 30 users", () => {
    expect(build([STABLE_BASE], [platform("Android", 124, 210)])[0]).toMatchObject({
      id: "platform:Android",
      severity: "warning",
      scope: "platform",
      text: "Android 유입 급감 41% (활성 사용자 210 → 124)",
    });
    expect(build([STABLE_BASE], [platform("Android", 10, 29)])).toEqual([]);
  });

  it("reports a share shift of at least 10 points as context, not alarm", () => {
    const insights = build(
      [STABLE_BASE],
      [platform("iOS", 510, 380), platform("Android", 490, 620)],
    );
    const share = insights.find((insight) => insight.id === "share:iOS");

    expect(share).toMatchObject({
      severity: "info",
      metric: "activeUsersShare",
      text: "iOS 비중 38% → 51%",
    });
  });
});

describe("ordering and limits", () => {
  it("puts warnings first, then the largest movement, and shows at most five", () => {
    const insights = build(
      [
        metric("activeUsers", "활성 사용자", 50, 100),
        metric("newUsers", "신규 사용자", 40, 100),
        metric("sessions", "세션", 200, 100),
        metric("keyEvents", "주요 이벤트", 30, 100),
        metric("totalRevenue", "총수익", 10_000, 100_000, "currency"),
        metric("engagementRate", "참여율", 0.3, 0.5, "percent"),
      ],
      [platform("iOS", 20, 200), platform("Android", 300, 100)],
    );

    expect(insights).toHaveLength(5);
    expect(insights.every((insight) => insight.severity === "warning")).toBe(true);
    const deltas = insights.map((insight) => Math.abs(insight.delta ?? 0));
    expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
  });

  it("says the base is too small rather than pretending nothing happened", () => {
    expect(build([metric("activeUsers", "활성 사용자", 12, 10)])).toEqual([
      {
        id: "info:small-base",
        severity: "info",
        text: "비교 기준이 작아 유의미한 변화를 판단하지 않았습니다.",
        metric: "activeUsers",
        scope: "total",
        delta: null,
        current: 12,
        previous: 10,
      },
    ]);
  });

  it("returns nothing when a healthy base simply did not move", () => {
    expect(build([metric("activeUsers", "활성 사용자", 101, 100)])).toEqual([]);
  });
});
