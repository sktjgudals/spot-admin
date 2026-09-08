import { describe, expect, it } from "vitest";
import { APP_EVENTS } from "./analytics-labels";
import { EMPTY_FILTERS } from "./analytics-filters";
import {
  FUNNEL_DEFINITIONS,
  FUNNEL_IDS,
  buildFunnelRequest,
  isFunnelId,
} from "./funnel-definitions";
import type { AnalyticsFunnelFilterExpression } from "./analytics-data-api";

function eventNames(
  expression: AnalyticsFunnelFilterExpression,
): string[] {
  if ("funnelEventFilter" in expression) {
    return [expression.funnelEventFilter.eventName];
  }
  if ("orGroup" in expression) {
    return expression.orGroup.expressions.flatMap(eventNames);
  }
  if ("andGroup" in expression) {
    return expression.andGroup.expressions.flatMap(eventNames);
  }
  if ("notExpression" in expression) return eventNames(expression.notExpression);
  return [];
}

describe("funnel presets", () => {
  it("only names events the app actually sends", () => {
    const names = FUNNEL_IDS.flatMap((id) =>
      FUNNEL_DEFINITIONS[id].steps.flatMap((step) =>
        eventNames(step.filterExpression),
      ),
    );

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(APP_EVENTS).toContain(name);
  });

  it("recognises only the three preset ids", () => {
    expect(FUNNEL_IDS).toEqual(["party-apply", "party-payment", "onboarding"]);
    expect(isFunnelId("party-apply")).toBe(true);
    expect(isFunnelId("checkout")).toBe(false);
  });

  it("builds 파티 신청 from a screen path and a templated mutation route", () => {
    expect(FUNNEL_DEFINITIONS["party-apply"].steps).toEqual([
      {
        name: "파티 상세",
        filterExpression: {
          funnelEventFilter: {
            eventName: "screen_view",
            funnelParameterFilterExpression: {
              funnelParameterFilter: {
                eventParameterName: "firebase_screen",
                stringFilter: { matchType: "EXACT", value: "/parties/:id" },
              },
            },
          },
        },
      },
      {
        name: "신청 화면",
        filterExpression: {
          funnelEventFilter: {
            eventName: "screen_view",
            funnelParameterFilterExpression: {
              funnelParameterFilter: {
                eventParameterName: "firebase_screen",
                stringFilter: { matchType: "EXACT", value: "/parties/:id/apply" },
              },
            },
          },
        },
      },
      {
        name: "신청 완료",
        filterExpression: {
          funnelEventFilter: {
            eventName: "api_mutation",
            funnelParameterFilterExpression: {
              andGroup: {
                expressions: [
                  {
                    funnelParameterFilter: {
                      eventParameterName: "route",
                      inListFilter: {
                        values: [
                          "/parties/:id/apply",
                          "/v2/parties/:id/apply",
                          "/parties/:id/:id",
                          "/v2/parties/:id/:id",
                        ],
                      },
                    },
                  },
                  {
                    funnelParameterFilter: {
                      eventParameterName: "method",
                      stringFilter: { matchType: "EXACT", value: "post" },
                    },
                  },
                  {
                    funnelParameterFilter: {
                      eventParameterName: "result",
                      stringFilter: { matchType: "EXACT", value: "success" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ]);
  });

  it("covers both payment routes with and without the /v2 prefix", () => {
    const [, intent, confirm] = FUNNEL_DEFINITIONS["party-payment"].steps;

    expect(JSON.stringify(intent)).toContain(
      '["/payments/intent","/v2/payments/intent"]',
    );
    expect(JSON.stringify(confirm)).toContain(
      '["/payments/confirm","/v2/payments/confirm"]',
    );
  });

  it("opens 온보딩 with either the app's first open or the web's first visit", () => {
    expect(FUNNEL_DEFINITIONS.onboarding.steps[0]).toEqual({
      name: "첫 실행·첫 방문",
      filterExpression: {
        orGroup: {
          expressions: [
            { funnelEventFilter: { eventName: "first_open" } },
            { funnelEventFilter: { eventName: "first_visit" } },
          ],
        },
      },
    });
    expect(
      FUNNEL_DEFINITIONS.onboarding.steps.map(({ name }) => name),
    ).toEqual(["첫 실행·첫 방문", "로그인 시작", "로그인 완료", "가입 완료"]);
  });
});

describe("buildFunnelRequest", () => {
  it("sends one date range, no breakdown and no filter by default", () => {
    const request = buildFunnelRequest(
      FUNNEL_DEFINITIONS.onboarding,
      "28d",
      EMPTY_FILTERS,
      false,
    );

    expect(request.dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday" },
    ]);
    expect(request.funnel.steps).toHaveLength(4);
    expect(request.funnelBreakdown).toBeUndefined();
    expect(request.dimensionFilter).toBeUndefined();
    expect(request.returnPropertyQuota).toBe(true);
    // Never send an unverified v1alpha field we have no test coverage for.
    expect(request.funnel.isOpenFunnel).toBeUndefined();
    expect(request.limit).toBeUndefined();
  });

  it("adds the platform breakdown and the dimension filter when asked", () => {
    const request = buildFunnelRequest(
      FUNNEL_DEFINITIONS["party-apply"],
      "7d",
      { platforms: ["iOS"], accountType: "consumer" },
      true,
    );

    expect(request.funnelBreakdown).toEqual({
      breakdownDimension: { name: "platform" },
      limit: 5,
    });
    expect(request.dimensionFilter).toEqual({
      andGroup: {
        expressions: [
          { filter: { fieldName: "platform", inListFilter: { values: ["iOS"] } } },
          {
            filter: {
              fieldName: "customUser:account_type",
              stringFilter: { matchType: "EXACT", value: "consumer" },
            },
          },
        ],
      },
    });
  });
});
