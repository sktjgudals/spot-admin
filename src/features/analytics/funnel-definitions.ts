import type {
  AnalyticsFunnelFilterExpression,
  AnalyticsFunnelParameterFilterExpression,
  AnalyticsRunFunnelReportRequest,
} from "./analytics-data-api";
import { analyticsDateRange } from "./analytics-report-shaping";
import { buildDimensionFilter, type AnalyticsFilters } from "./analytics-filters";
import type { AnalyticsDateRange } from "./types";

/**
 * The three product questions this screen can answer with a funnel.
 *
 * Steps are matched on event parameters the app already sends — `firebase_screen`
 * for screens, `route`/`method`/`result` for API mutations — so no new app
 * release is needed. What *is* needed is that GA4 can see those parameters; see
 * docs/OPERATIONS.md before concluding a zero step means nobody applied.
 *
 * Every funnel is closed: `isOpenFunnel` is never sent, and GA4 treats an
 * absent flag as closed, which is the stricter and more honest reading.
 */

export const FUNNEL_IDS = [
  "party-apply",
  "party-payment",
  "onboarding",
] as const;

export type FunnelId = (typeof FUNNEL_IDS)[number];

export type FunnelStepDefinition = {
  name: string;
  filterExpression: AnalyticsFunnelFilterExpression;
};

export type FunnelDefinition = {
  id: FunnelId;
  title: string;
  description: string;
  steps: FunnelStepDefinition[];
};

export const FUNNEL_BREAKDOWN_DIMENSION = "platform";

/** GA4's own default; stated explicitly so a reader does not have to know it. */
export const FUNNEL_BREAKDOWN_LIMIT = 5;

export function isFunnelId(value: string): value is FunnelId {
  return (FUNNEL_IDS as readonly string[]).includes(value);
}

export function eventStep(name: string, eventName: string): FunnelStepDefinition {
  return { name, filterExpression: { funnelEventFilter: { eventName } } };
}

/** One step satisfied by any of several events — the app and the web start differently. */
export function anyEventStep(
  name: string,
  eventNames: readonly string[],
): FunnelStepDefinition {
  return {
    name,
    filterExpression: {
      orGroup: {
        expressions: eventNames.map((eventName) => ({
          funnelEventFilter: { eventName },
        })),
      },
    },
  };
}

export function screenStep(name: string, screen: string): FunnelStepDefinition {
  return {
    name,
    filterExpression: {
      funnelEventFilter: {
        eventName: "screen_view",
        funnelParameterFilterExpression: {
          funnelParameterFilter: {
            eventParameterName: "firebase_screen",
            stringFilter: { matchType: "EXACT", value: screen },
          },
        },
      },
    },
  };
}

export function mutationStep(
  name: string,
  input: { routes: readonly string[]; method: string; result: string },
): FunnelStepDefinition {
  const expressions: AnalyticsFunnelParameterFilterExpression[] = [
    {
      funnelParameterFilter: {
        eventParameterName: "route",
        inListFilter: { values: input.routes },
      },
    },
    {
      funnelParameterFilter: {
        eventParameterName: "method",
        stringFilter: { matchType: "EXACT", value: input.method },
      },
    },
    {
      funnelParameterFilter: {
        eventParameterName: "result",
        stringFilter: { matchType: "EXACT", value: input.result },
      },
    },
  ];
  return {
    name,
    filterExpression: {
      funnelEventFilter: {
        eventName: "api_mutation",
        funnelParameterFilterExpression: { andGroup: { expressions } },
      },
    },
  };
}

/**
 * TODO(app ≥ 1.0.6 dominant): drop the `/parties/:id/:id` forms. Builds before
 * the route-template fix reported the nested id twice; dropping them now would
 * quietly shrink the funnel's last step for anyone still on an older build.
 * The `/v2` prefix depends on the Dio base URL, so both prefixes stay.
 */
const APPLY_ROUTES = [
  "/parties/:id/apply",
  "/v2/parties/:id/apply",
  "/parties/:id/:id",
  "/v2/parties/:id/:id",
] as const;

export const FUNNEL_DEFINITIONS: Record<FunnelId, FunnelDefinition> = {
  "party-apply": {
    id: "party-apply",
    title: "파티 신청",
    description: "파티 상세에서 신청 완료까지의 단계별 이탈입니다.",
    steps: [
      screenStep("파티 상세", "/parties/:id"),
      screenStep("신청 화면", "/parties/:id/apply"),
      mutationStep("신청 완료", {
        routes: APPLY_ROUTES,
        method: "post",
        result: "success",
      }),
    ],
  },
  "party-payment": {
    id: "party-payment",
    title: "결제",
    description: "결제 화면 진입부터 승인까지의 단계별 이탈입니다.",
    steps: [
      screenStep("결제 화면", "/parties/:id/payment"),
      mutationStep("결제 의도", {
        routes: ["/payments/intent", "/v2/payments/intent"],
        method: "post",
        result: "success",
      }),
      mutationStep("결제 승인", {
        routes: ["/payments/confirm", "/v2/payments/confirm"],
        method: "post",
        result: "success",
      }),
    ],
  },
  onboarding: {
    id: "onboarding",
    title: "온보딩",
    description: "첫 실행에서 가입 완료까지의 단계별 이탈입니다.",
    steps: [
      anyEventStep("첫 실행·첫 방문", ["first_open", "first_visit"]),
      eventStep("로그인 시작", "login_started"),
      eventStep("로그인 완료", "login_completed"),
      eventStep("가입 완료", "signup_completed"),
    ],
  },
};

/**
 * Web `app_cta_click` cannot be joined to app `first_open` in one funnel: the
 * two live on different data streams with different client ids, so GA4 has no
 * user to carry across the step boundary. Measure that hand-off with the web
 * and app onboarding funnels side by side instead of inventing a joined one.
 */
export function buildFunnelRequest(
  definition: FunnelDefinition,
  range: AnalyticsDateRange,
  filters: AnalyticsFilters,
  breakdown: boolean,
): AnalyticsRunFunnelReportRequest {
  const dimensionFilter = buildDimensionFilter(filters);
  return {
    dateRanges: [analyticsDateRange(range)],
    funnel: {
      steps: definition.steps.map(({ name, filterExpression }) => ({
        name,
        filterExpression,
      })),
    },
    ...(breakdown
      ? {
          funnelBreakdown: {
            breakdownDimension: { name: FUNNEL_BREAKDOWN_DIMENSION },
            limit: FUNNEL_BREAKDOWN_LIMIT,
          },
        }
      : {}),
    ...(dimensionFilter ? { dimensionFilter } : {}),
    returnPropertyQuota: true,
  };
}
