# 제품 분석 고도화 — 퍼널 · 리텐션 코호트 · 추세 차트 + 필터 · 인사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/super-admin/analytics` from five read-only GA4 tables into an analysis surface: a step funnel, a weekly retention cohort heatmap, a real day-by-day trend chart with previous-period comparison, platform/account-type filters that thread through every report, and a generated Korean insight summary.

**Architecture:** Everything still runs in the browser against `https://analyticsdata.googleapis.com` with the session-bound OAuth token — no backend, no new route handlers. Three layers grow bottom-up: (1) `analytics-data-api.ts` gains version routing (`runFunnelReport` lives on `v1alpha`, everything else on `v1beta`), a `getMetadata` GET, cohort/funnel request types and a funnel contract assertion; (2) a set of *pure*, separately-tested modules (`analytics-report-shaping`, `analytics-format`, `analytics-filters`, `funnel-definitions`, `analytics-funnel`, `analytics-retention`, `analytics-insights`, `analytics-quota`) that hold every rule this feature adds; (3) `analytics-reports.ts` composes them into one result union, and the dashboard renders it. The trend chart is a dependency-free inline SVG component loaded through `createRetryableLazyComponent` so the chart never lands in the analytics route's first chunk.

**Tech Stack:** Next.js 16 App Router (React 19.2.4) on OpenNext/Cloudflare Workers, TanStack Query v5, Base UI (`@base-ui/react`) + Tailwind v4 semantic tokens, `zod/mini`, lucide-react, Vitest 3 + jsdom + Testing Library, `node --test` for release-contract scripts.

**Spec:** `docs/superpowers/specs/2026-09-08-analytics-analysis-design.md` — read it before Task 1. This plan argues from it; every place the code contradicted the spec, the code won and the deviation is called out inline.

## Global Constraints

Every task's requirements implicitly include this section.

### Workspace
- Work **only** inside `/Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics` (git worktree, branch `feat/analytics-analysis`, based on `feat/super-admin-user-detail` head `b746e69`; the spec doc commit `30b98e0` is already on the branch). `npm ci` is already done.
- **Never** `cd` into `/Users/seohyeongmin/Desktop/github/spot-admin`, `/Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin`, or `/Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail` — those are different checkouts of the same repository. Bash working directories reset between calls; always use absolute paths.
- Before every commit, re-check the branch: `git -C /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics rev-parse --abbrev-ref HEAD` must print `feat/analytics-analysis`.

### Runtime boundaries (`scripts/check-admin-runtime-boundaries.mjs`)
The check scans every `.js/.jsx/.mjs/.ts/.tsx` under `src/` plus `package.json`, `next.config.ts`, `.env.example`. No file may contain `@/lib/prisma`, `generated/prisma`, `@prisma/client`, `@prisma/adapter-pg`, `PrismaClient`, `DATABASE_URL`, a string literal starting `/api/super-admin` · `/api/business` · `/api/party-categories`, `@/lib/api-auth`, `@/lib/backend-internal`, `@/lib/fetch-json`, `@/lib/legacy-bff`, or a string literal starting `/business`. Nothing in this feature touches a Dopa server: every request goes straight to Google.

### No new dependencies — the chart is inline SVG
- `scripts/test-production-hardening.mjs:52-55` asserts `package.json.dependencies.recharts === undefined` ("stay deleted" guard), alongside the three `@dnd-kit/*` packages. **Do not add `recharts`, `d3`, `victory`, `visx`, `chart.js` or any charting package.** `charts/TrendChart.tsx` is hand-written `<svg>`.
- Validation imports come from **`zod/mini` only**. `scripts/test-admin-ui-foundation.mjs:324-335` fails on `from "zod"` anywhere under `src/`.

### Design rules (`docs/design/DESIGN.md` + `scripts/test-admin-ui-foundation.mjs`)
- Semantic tokens only. No raw palette utilities matching `(?:bg|text|border|ring|fill)-(?:red|green|emerald|amber|yellow|blue|violet|purple|pink)-` anywhere under `src/`.
- Chart color comes from the five existing runtime variables in `src/app/globals.css` — `--chart-1` … `--chart-5` (light `:root` lines 98–102, dark `.dark` lines 152–156), exposed to Tailwind as `--color-chart-1` … `--color-chart-5` (`@theme inline`, lines 22–26). Use `var(--chart-N)` in inline `style`/`fill`/`stroke`, or the `bg-chart-N`/`text-chart-N` utilities. Never a hex or a raw palette name.
- No `text-[9px]`, `text-[10px]`, `text-[11px]`.
- Focus rings use the opaque token: `focus-visible:ring-ring` / `focus-visible:ring-sidebar-ring`. Never `ring-ring/50`-style alpha — the regex `focus(-visible)?:ring-(ring|sidebar-ring)\/\d+` is a hard failure.
- Status is never color-only: every colored bar, cell and badge carries text or an icon that says the same thing.
- Loading states preserve the shape of the final content; errors say what failed and offer one retry; empty states distinguish "no data" from "filtered out".
- Numbers, percentages, amounts and timestamps use `tabular-nums`.
- The dashboard must **not** statically import `./charts/TrendChart` — Task 5 adds a release-contract assertion for that.

### GA4 request contract (exact — these values are asserted by tests)

**Version routing.** `runReport`, `batchRunReports`, `runRealtimeReport` → `https://analyticsdata.googleapis.com/v1beta`. `runFunnelReport` → `https://analyticsdata.googleapis.com/v1alpha`. Same host, same `Authorization: Bearer …` header, same error taxonomy. `getMetadata` is a **GET** to `https://analyticsdata.googleapis.com/v1beta/properties/{id}/metadata`.

**Funnel presets** (closed funnels — `isOpenFunnel` is omitted, which means `false`). Step names are the Korean labels below; event names must all exist in `EVENT_LABELS`:

| id | title | steps |
| --- | --- | --- |
| `party-apply` | 파티 신청 | `screen_view` firebase_screen `/parties/:id` → `screen_view` firebase_screen `/parties/:id/apply` → `api_mutation` route ∈ `["/parties/:id/apply", "/v2/parties/:id/apply", "/parties/:id/:id", "/v2/parties/:id/:id"]` ∧ method `post` ∧ result `success` |
| `party-payment` | 결제 | `screen_view` firebase_screen `/parties/:id/payment` → `api_mutation` route ∈ `["/payments/intent", "/v2/payments/intent"]` ∧ `post` ∧ `success` → `api_mutation` route ∈ `["/payments/confirm", "/v2/payments/confirm"]` ∧ `post` ∧ `success` |
| `onboarding` | 온보딩 | `orGroup[first_open, first_visit]` → `login_started` → `login_completed` → `signup_completed` |

The `/parties/:id/:id` and `/v2/parties/:id/:id` forms cover app builds from before the route-template fix; the `/v2` prefix depends on the Dio base URL. Both forms stay until ≥ 1.0.6 dominates — the code carries that as a comment, not a silent assumption.

**Funnel breakdown:** `{ breakdownDimension: { name: "platform" }, limit: 5 }`. Under a breakdown GA4 emits a `RESERVED_TOTAL` row per step in the breakdown column; those rows are the funnel's real totals.

**Cohort spec** (retention): 6 weekly cohorts, `cohortsRange: { granularity: "WEEKLY", startOffset: 0, endOffset: 4 }`, cohort ranges Sunday–Saturday, `Cohort.dimension` always `"firstSessionDate"`, cohort `name` = the range's ISO start date. **A request carrying `cohortSpec` must not carry top-level `dateRanges`.** Dimensions `cohort`, `cohortNthWeek`; metrics `cohortActiveUsers`, `cohortTotalUsers`; `limit: 100` (6 × 5 = 30 rows max); one Core request.

**Two named date ranges:** the overview's series and platform requests send `dateRanges: [{ …, name: "current" }, { …, name: "previous" }]`. GA4 then appends an implicit **trailing** `dateRange` dimension whose row values are the range names. `assertReportContract` must accept that extra trailing header **only** when `request.dateRanges.length > 1`.

**Platform values** are exactly `"iOS" | "Android" | "web"` (that casing). Confirmed against the existing 실시간 view, which already renders a `platform` dimension.

**Account-type filter dimension** is `customUser:account_type` (user-scoped GA4 custom dimension registered from the `account_type` user property, values `business` | `consumer`). If the property has not registered it, the select is disabled — never silently dropped from the request.

**Realtime ignores filters.** `runRealtimeReport` has no `dimensionFilter` in this feature; the filter bar says so.

### Insight thresholds (`DEFAULT_INSIGHT_THRESHOLDS`)
`totalDeltaPercent: 20`, `totalBaseUsers: 50`, `revenueBase: 1`, `engagementPointDelta: 5`, `platformDeltaPercent: 25`, `platformBaseUsers: 30`, `shareShiftPoints: 10`, `maxInsights: 5`. Ordering: severity (`warning` → `positive` → `info`) → `|delta|` desc → `metric` asc → `id` asc, then `slice(0, 5)`.

### Cache policy
`staleTime` = `gcTime`: realtime **60 s** (and `refetchInterval: 60_000`), overview and the three table views **5 min**, funnel and retention **15 min**. Capabilities: `staleTime: Infinity`, `retry: false`. Every report query keeps `retry: false` and `placeholderData: keepPreviousData`.

### Korean UI copy asserted by tests (verbatim)

Tabs and controls: `개요` · `유입` · `참여` · `전환·매출` · `퍼널` · `리텐션` · `실시간` · `GA4 속성` · `비교 기간` · `최근 7일` · `최근 28일` · `최근 90일` · `연결 끊기` · `보고서 필터` · `계정 유형` · `전체` · `일반 사용자` · `업체` · `필터 초기화` · `필터 %d개 적용 중` · `실시간 보고서에는 필터가 적용되지 않습니다.` · `GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.` · `리텐션은 최근 6주 코호트 고정` · `필터 적용 중`

Trend: `일별 추세` · `활성 사용자` · `신규 사용자` · `세션` · `이전 기간 비교` · `추세 지표` · `일별 추세: 활성 사용자` · `일별 추세: 세션` · `날짜` · `이번 기간` · `이전 기간` · `표시할 일별 데이터가 없습니다.`

Funnel: `퍼널` · `파티 신청` · `결제` · `온보딩` · `플랫폼별 보기` · `다음 단계 전환 ` · `이탈 ` · `마지막 단계` · `선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을 확인해 주세요.`
Funnel step names (asserted in `funnel-definitions.test.ts`): `파티 상세` · `신청 화면` · `신청 완료` · `결제 화면` · `결제 의도` · `결제 승인` · `첫 실행·첫 방문` · `로그인 시작` · `로그인 완료` · `가입 완료`

Retention: `리텐션` · `주간 코호트 리텐션` · `첫 세션 주 기준 주간 코호트 · GA4 firstSessionDate` · `코호트 시작일` · `크기` · `1주` · `2주` · `3주` · `4주` · `† 아직 끝나지 않은 주` · `낮음` · `높음` · `최근 6주 코호트에서 첫 세션 사용자가 확인되지 않습니다.`

Insights: `인사이트 요약` · `주의` · `긍정` · `참고` · `이전 기간 대비 눈에 띄는 변화가 없습니다.` · `비교 기준이 작아 유의미한 변화를 판단하지 않았습니다.`

Quota: `GA API 할당량 상태` · `GA API 시간당 할당량이 10% 미만입니다. 퍼널·리텐션은 토큰을 많이 소비합니다.` · `GA API 일일 할당량이 10% 미만입니다. 퍼널·리텐션은 토큰을 많이 소비합니다.` · `GA API 할당량을 모두 사용했습니다. 퍼널·리텐션은 토큰을 많이 소비합니다.` · `Core` · `실시간` · `퍼널(별도 풀)`

Lazy-load failure: `추세 차트를 불러오지 못했습니다.`
Placeholder announcement: `필터 적용 중입니다. 이전 결과를 표시하고 있습니다.`

Retained from the current screen (do not reword): `분석 설정 필요` · `Google Analytics 연결` · `Google Analytics 연결이 만료되었습니다.` · `데이터 품질 안내` · `다시 시도` · `선택한 기간에 수집된 데이터가 없습니다.` · `선택한 기간에 표시할 수 있는 데이터가 없습니다.` · `Google Analytics 보고서를 불러오는 중입니다.` · `권한` · `보관` · `전송` · `analytics.readonly만 요청` · `이 탭의 메모리에만 유지 · 로그아웃 시 삭제` · `Google Data API로 직접 요청`

### Test commands
- One file: `npx vitest run <file>` (run from the worktree root, absolute path fine).
- Release contracts: `node --test scripts/test-admin-ui-foundation.mjs` and `node --test scripts/test-production-hardening.mjs`.
- Everything: `npm run verify` = `vitest run` + `node --test scripts/test-*.mjs` + `check:admin-runtime` + `eslint` + the OpenNext Cloudflare build.
- Do **not** run `npx prettier`; the repo has no prettier step and reformatting breaks unrelated release-test regexes.
- The suite has no `TZ` pin (`vitest.config.ts` sets only `environment`, `setupFiles`, `include`). **Never write a date test that depends on the machine's zone** — build `Date`s from local components (`new Date(2026, 8, 8, 12)`) rather than from an offset string.

### Commit trailers
Every commit message body ends with these two lines, verbatim:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
```

---

## File Structure

**Create**
- `src/features/analytics/analytics-report-shaping.ts` — `assertFiniteNumericString`, `numericValue`, `reportRows`, `firstMetric`, `quotaFromReports`, `dataQualityNoticesForReport`, `emptyReport` (moved out of `analytics-reports.ts`; also replaces `user-behavior-report.ts`'s private copy of the quota merge)
- `src/features/analytics/analytics-report-shaping.test.ts`
- `src/features/analytics/analytics-format.ts` — `formatMetric`, `percentChange`, `formatGaDate`, `formatCount`, `formatPercentLabel` (moved out of `AnalyticsDashboard.tsx`)
- `src/features/analytics/analytics-format.test.ts`
- `src/features/analytics/analytics-filters.ts` — `AnalyticsFilters`, `EMPTY_FILTERS`, `filtersKey`, `activeFilterCount`, `togglePlatform`, `buildDimensionFilter`, `availablePlatforms`
- `src/features/analytics/analytics-filters.test.ts`
- `src/features/analytics/funnel-definitions.ts` — step helpers, the three presets, `buildFunnelRequest`
- `src/features/analytics/funnel-definitions.test.ts`
- `src/features/analytics/analytics-funnel.ts` — `shapeFunnel`, `fetchFunnel`
- `src/features/analytics/analytics-funnel.test.ts`
- `src/features/analytics/analytics-retention.ts` — `buildWeeklyCohorts`, `buildRetentionRequest`, `shapeRetention`, `fetchRetention`
- `src/features/analytics/analytics-retention.test.ts`
- `src/features/analytics/analytics-insights.ts` — `DEFAULT_INSIGHT_THRESHOLDS`, `buildInsights`
- `src/features/analytics/analytics-insights.test.ts`
- `src/features/analytics/analytics-quota.ts` — `quotaPressure`, `QUOTA_POOL_LABELS`
- `src/features/analytics/analytics-quota.test.ts`
- `src/features/analytics/charts/TrendChart.tsx` — default-exported inline-SVG chart
- `src/features/analytics/charts/TrendChart.test.tsx`
- `src/features/analytics/AnalyticsFilterBar.tsx`
- `src/features/analytics/AnalyticsFilterBar.test.tsx`
- `src/features/analytics/InsightsPanel.tsx`
- `src/features/analytics/InsightsPanel.test.tsx`
- `src/features/analytics/FunnelPanel.tsx`
- `src/features/analytics/FunnelPanel.test.tsx`
- `src/features/analytics/RetentionHeatmap.tsx`
- `src/features/analytics/RetentionHeatmap.test.tsx`
- `docs/tasks/2026-09-08-ga4-funnel-retention-trends-insights.md`

**Modify**
- `src/features/analytics/analytics-data-api.ts` — version routing, `performAnalyticsRequest`, `getAnalyticsMetadata`, cohort/metric-filter/funnel types + schema, `runAnalyticsFunnelReport`, `assertFunnelContract`, `dateRange`-aware `assertReportContract`
- `src/features/analytics/analytics-data-api.test.ts`
- `src/features/analytics/analytics-labels.ts` — add `APP_EVENTS` / `isKnownAppEvent`
- `src/features/analytics/analytics-query-keys.ts` — `report()` gains `filtersKey` and `variant`; add `capabilities()`
- `src/features/analytics/types.ts` — view union += `funnel`/`retention`, `AnalyticsQuotaState.category`, trend/platform/insight/funnel/retention result types
- `src/features/analytics/analytics-reports.ts` — overview rewrite, filter threading, dispatcher, `fetchAnalyticsCapabilities`; re-export shims removed
- `src/features/analytics/analytics-reports.test.ts`
- `src/features/analytics/user-behavior-report.ts` — import the shared shaping helpers instead of its private `quotaFromResponses`
- `src/features/analytics/AnalyticsDashboard.tsx` — filters, new tabs, lazy chart, insights, quota banner
- `src/features/analytics/AnalyticsDashboard.test.tsx`
- `src/features/analytics/AnalyticsStates.tsx` — `QuotaFooter` pool labels + `QuotaBanner`
- `scripts/test-admin-ui-foundation.mjs` — one new release contract
- `docs/OPERATIONS.md` — GA4 section: new views + setup checklist
- `docs/design/design-tokens.json` — `color.light.chart` / `color.dark.chart` mirrors

**Not created on purpose:** `src/features/analytics/analytics-events.ts`. The spec suggested a new module holding `APP_EVENTS` + `EVENT_LABELS`, but `analytics-labels.ts` already owns the event vocabulary and is imported by two screens. Adding `APP_EVENTS` there keeps one source of truth without a re-export hop.

---

### Task 1: Data API client — version routing, metadata, cohort + funnel requests

**Files:**
- Modify: `src/features/analytics/analytics-data-api.ts` (root constant at line 3; `assertReportContract` at 299–325; `requestAnalyticsData` at 327–397; the three exported runners at 399–452)
- Test: `src/features/analytics/analytics-data-api.test.ts` (append to the existing `describe("Google Analytics Data API client", …)`)

**Interfaces:**
- Consumes: nothing new. `z` from `zod/mini`, the existing `headerSchema` / `metricHeaderSchema` / `rowSchema` / `quotaCountSchema` / `quotaEntrySchema` / `samplingMetadataSchema` already declared at lines 78–96.
- Produces, for Tasks 2–4:
  - `runAnalyticsFunnelReport(propertyId: string, request: AnalyticsRunFunnelReportRequest, options: AnalyticsDataApiOptions): Promise<AnalyticsFunnelReportResponse>`
  - `getAnalyticsMetadata(propertyId: string, options: AnalyticsDataApiOptions): Promise<AnalyticsMetadataResponse>`
  - types `AnalyticsCohort`, `AnalyticsCohortsRange`, `AnalyticsCohortSpec`, `AnalyticsFunnelParameterFilter`, `AnalyticsFunnelParameterFilterExpression`, `AnalyticsFunnelEventFilter`, `AnalyticsFunnelFilterExpression`, `AnalyticsFunnelStep`, `AnalyticsRunFunnelReportRequest`, `AnalyticsFunnelReportResponse`, `AnalyticsFunnelSubReport`, `AnalyticsMetadataResponse`
  - constants `DATE_RANGE_DIMENSION = "dateRange"`, `FUNNEL_STEP_DIMENSION = "funnelStepName"`, `FUNNEL_METRICS` (readonly 4-tuple)
  - `AnalyticsRunReportRequest.dateRanges` is now **optional** and the type gains `cohortSpec?: AnalyticsCohortSpec`

**Verified API facts this task encodes** (confirmed against the Google Analytics Data API v1 docs — see the "API confirmation ledger" at the end of this plan):
- `POST https://analyticsdata.googleapis.com/v1alpha/properties/{id}:runFunnelReport`; response `{ funnelTable, funnelVisualization, kind: "analyticsData#runFunnelReport" }`.
- `funnelTable.dimensionHeaders[0].name === "funnelStepName"`, and its row values carry an API-added ordinal prefix (`"1. First open/visit"` for a step the request named `"First open/visit"`).
- Under a breakdown the totals row carries `"RESERVED_TOTAL"` in the **breakdown** column (index 1), not the step column.
- `funnelTable.metricHeaders` are exactly `activeUsers`, `funnelStepCompletionRate`, `funnelStepAbandonments`, `funnelStepAbandonmentRate` — and the two rate metrics are reported with `type: "TYPE_INTEGER"` while carrying **fractional** string values (`"0.2778…"` = 27.78 %). **Never branch on `metricHeaders[].type`; always parse as a float.**
- With two `dateRanges`, GA4 appends a `dateRange` dimension **last**; row values are `date_range_0` / `date_range_1` when the ranges are unnamed. The docs do not state what a supplied `name` produces, so Task 3 accepts **both** the supplied name and the positional value.
- `GET https://analyticsdata.googleapis.com/v1beta/properties/{id}/metadata` → `{ name, dimensions[], metrics[], comparisons[] }`, each entry `{ apiName, uiName, description, deprecatedApiNames[], customDefinition, category }`.
- `runFunnelReport` consumes a **Funnel** quota pool, distinct from Core and Realtime.

**Unverified fields, deliberately minimised.** The indexed docs do not cover the v1alpha `RunFunnelReportRequest` reference page, so `returnPropertyQuota` and `dimensionFilter` on a funnel request are *not* doc-confirmed. Both are sent (they exist in the live v1alpha reference), but the response schema treats `propertyQuota` as optional and `shapeFunnel` tolerates its absence. **If the live API rejects a funnel request with a `request`-kind error naming one of those fields, delete that line from `buildFunnelRequest` (Task 2) — the funnel keeps working, only its quota footer goes empty.** `funnel.isOpenFunnel`, `funnel.steps[].isDirectlyFollowedBy` and the request-level `limit` stay in the type but are **never sent**, so no unverified field rides along by accident.

- [ ] **Step 1: Write the failing version-routing + metadata tests**

Append these three `it` blocks inside the existing `describe` in `src/features/analytics/analytics-data-api.test.ts` (before its closing `});`), and widen the file's import at line 2–7 to:

```ts
import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
  getAnalyticsMetadata,
  runAnalyticsFunnelReport,
  runAnalyticsRealtimeReport,
  runAnalyticsReport,
} from "./analytics-data-api";
```

```ts
  it("routes runFunnelReport to v1alpha and round-trips the funnel body", async () => {
    const funnelRequest = {
      dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      funnel: {
        steps: [
          {
            name: "파티 상세",
            filterExpression: {
              funnelEventFilter: {
                eventName: "screen_view",
                funnelParameterFilterExpression: {
                  funnelParameterFilter: {
                    eventParameterName: "firebase_screen",
                    stringFilter: { matchType: "EXACT" as const, value: "/parties/:id" },
                  },
                },
              },
            },
          },
          {
            name: "신청 완료",
            filterExpression: { funnelEventFilter: { eventName: "api_mutation" } },
          },
        ],
      },
      funnelBreakdown: { breakdownDimension: { name: "platform" }, limit: 5 },
      returnPropertyQuota: true,
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: "analyticsData#runFunnelReport",
          funnelTable: {
            dimensionHeaders: [{ name: "funnelStepName" }, { name: "platform" }],
            metricHeaders: [
              { name: "activeUsers", type: "TYPE_INTEGER" },
              { name: "funnelStepCompletionRate", type: "TYPE_INTEGER" },
              { name: "funnelStepAbandonments", type: "TYPE_INTEGER" },
              { name: "funnelStepAbandonmentRate", type: "TYPE_INTEGER" },
            ],
            rows: [
              {
                dimensionValues: [{ value: "1. 파티 상세" }, { value: "RESERVED_TOTAL" }],
                metricValues: [
                  { value: "1000" },
                  { value: "0.412" },
                  { value: "588" },
                  { value: "0.588" },
                ],
              },
              {
                dimensionValues: [{ value: "1. 파티 상세" }, { value: "iOS" }],
                metricValues: [
                  { value: "600" },
                  { value: "0.5" },
                  { value: "300" },
                  { value: "0.5" },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await runAnalyticsFunnelReport("1234", funnelRequest, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1alpha/properties/1234:runFunnelReport",
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret-access-token",
    );
    expect(JSON.parse(String(init.body))).toEqual(funnelRequest);
    expect(response.funnelTable?.rows[0]?.dimensionValues[1]?.value).toBe(
      "RESERVED_TOTAL",
    );
  });

  it.each([
    [
      "a missing funnel table",
      { kind: "analyticsData#runFunnelReport" },
    ],
    [
      "a first dimension header that is not funnelStepName",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "platform" }],
          metricHeaders: [
            { name: "activeUsers" },
            { name: "funnelStepCompletionRate" },
            { name: "funnelStepAbandonments" },
            { name: "funnelStepAbandonmentRate" },
          ],
          rows: [],
        },
      },
    ],
    [
      "a breakdown header the request never asked for",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "funnelStepName" }, { name: "platform" }],
          metricHeaders: [
            { name: "activeUsers" },
            { name: "funnelStepCompletionRate" },
            { name: "funnelStepAbandonments" },
            { name: "funnelStepAbandonmentRate" },
          ],
          rows: [],
        },
      },
    ],
    [
      "a dropped funnel metric",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "funnelStepName" }],
          metricHeaders: [{ name: "activeUsers" }],
          rows: [],
        },
      },
    ],
    [
      "a row whose value count disagrees with the headers",
      {
        funnelTable: {
          dimensionHeaders: [{ name: "funnelStepName" }],
          metricHeaders: [
            { name: "activeUsers" },
            { name: "funnelStepCompletionRate" },
            { name: "funnelStepAbandonments" },
            { name: "funnelStepAbandonmentRate" },
          ],
          rows: [{ dimensionValues: [{ value: "1. a" }], metricValues: [{ value: "1" }] }],
        },
      },
    ],
  ] as const)("rejects a funnel response with %s", async (_case, payload) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      runAnalyticsFunnelReport(
        "1234",
        {
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          funnel: {
            steps: [
              {
                name: "a",
                filterExpression: { funnelEventFilter: { eventName: "first_open" } },
              },
            ],
          },
        },
        { accessToken: "secret-access-token", fetchImpl },
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("reads property metadata over GET on v1beta and reuses the error taxonomy", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "properties/1234/metadata",
            dimensions: [
              { apiName: "platform", uiName: "Platform", customDefinition: false },
              {
                apiName: "customUser:account_type",
                uiName: "계정 유형",
                customDefinition: true,
              },
            ],
            metrics: [{ apiName: "activeUsers", uiName: "Active users" }],
            comparisons: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const metadata = await getAnalyticsMetadata("1234", {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/1234/metadata",
    );
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(metadata.dimensions.map(({ apiName }) => apiName)).toEqual([
      "platform",
      "customUser:account_type",
    ]);

    await expect(
      getAnalyticsMetadata("1234", {
        accessToken: "secret-access-token",
        fetchImpl,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "permission",
      }),
    );
  });
```

- [ ] **Step 2: Write the failing `dateRange` / cohort contract tests**

Append two more `it` blocks in the same `describe`:

```ts
  it("accepts the implicit trailing dateRange header only when two ranges were requested", async () => {
    const payload = {
      dimensionHeaders: [{ name: "date" }, { name: "dateRange" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [
        {
          dimensionValues: [{ value: "20260901" }, { value: "current" }],
          metricValues: [{ value: "12" }],
        },
      ],
      rowCount: 1,
    };
    const twoRanges = {
      dateRanges: [
        { startDate: "28daysAgo", endDate: "yesterday", name: "current" },
        { startDate: "56daysAgo", endDate: "29daysAgo", name: "previous" },
      ],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    };
    const oneRange = {
      dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    };
    const respond = () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const accepted = await runAnalyticsReport("1234", twoRanges, {
      accessToken: "secret-access-token",
      fetchImpl: vi.fn().mockResolvedValue(respond()),
    });
    expect(accepted.dimensionHeaders.at(-1)?.name).toBe("dateRange");

    await expect(
      runAnalyticsReport("1234", oneRange, {
        accessToken: "secret-access-token",
        fetchImpl: vi.fn().mockResolvedValue(respond()),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });

  it("serializes a cohort request that carries no top-level dateRanges", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          dimensionHeaders: [{ name: "cohort" }, { name: "cohortNthWeek" }],
          metricHeaders: [
            { name: "cohortActiveUsers" },
            { name: "cohortTotalUsers" },
          ],
          rows: [
            {
              dimensionValues: [{ value: "2026-08-30" }, { value: "0000" }],
              metricValues: [{ value: "120" }, { value: "120" }],
            },
          ],
          rowCount: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const request = {
      dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
      metrics: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
      cohortSpec: {
        cohorts: [
          {
            name: "2026-08-30",
            dimension: "firstSessionDate" as const,
            dateRange: { startDate: "2026-08-30", endDate: "2026-09-05" },
          },
        ],
        cohortsRange: {
          granularity: "WEEKLY" as const,
          startOffset: 0,
          endOffset: 4,
        },
      },
      limit: 100,
      returnPropertyQuota: true,
    };

    await runAnalyticsReport("1234", request, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual(request);
    expect(body.dateRanges).toBeUndefined();
  });
```

- [ ] **Step 3: Run the new tests and watch them fail**

Run: `npx vitest run src/features/analytics/analytics-data-api.test.ts`
Expected: FAIL — `runAnalyticsFunnelReport` and `getAnalyticsMetadata` are not exported; the two-date-range report is rejected as `invalid-response`; TypeScript rejects `cohortSpec` and the missing `dateRanges`.

- [ ] **Step 4: Add version routing and extract `performAnalyticsRequest`**

In `src/features/analytics/analytics-data-api.ts`, replace line 3 (`const ANALYTICS_DATA_API_ROOT = …`) with:

```ts
/**
 * Same host, two surfaces. `runFunnelReport` only exists on v1alpha; routing by
 * method keeps that fact in one table instead of scattering a second base URL
 * through the call sites — and keeps every method on one auth/retry path.
 */
const ANALYTICS_DATA_API_ROOTS = {
  v1beta: "https://analyticsdata.googleapis.com/v1beta",
  v1alpha: "https://analyticsdata.googleapis.com/v1alpha",
} as const;

const METHOD_VERSIONS = {
  runReport: "v1beta",
  batchRunReports: "v1beta",
  runRealtimeReport: "v1beta",
  runFunnelReport: "v1alpha",
} as const satisfies Record<string, keyof typeof ANALYTICS_DATA_API_ROOTS>;

type AnalyticsDataApiMethod = keyof typeof METHOD_VERSIONS;

/** GA4 appends this dimension itself when a request carries two date ranges. */
export const DATE_RANGE_DIMENSION = "dateRange";

/** First dimension of every `funnelTable`. */
export const FUNNEL_STEP_DIMENSION = "funnelStepName";

/**
 * The four metrics GA4 returns in a `funnelTable`.
 *
 * `funnelStepCompletionRate` and `funnelStepAbandonmentRate` are reported with
 * `type: "TYPE_INTEGER"` but hold fractional strings ("0.412" = 41.2%). Read
 * them as floats and never branch on the header's `type`.
 */
export const FUNNEL_METRICS = [
  "activeUsers",
  "funnelStepCompletionRate",
  "funnelStepAbandonments",
  "funnelStepAbandonmentRate",
] as const;
```

Then replace the whole body of `requestAnalyticsData` (lines 327–397) with the extracted pair:

```ts
async function performAnalyticsRequest<T>(
  url: string,
  init: { method: "GET" | "POST"; body?: string },
  schema: z.ZodMiniType<T>,
  options: AnalyticsDataApiOptions,
): Promise<T> {
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new AnalyticsDataApiError(
      "expired",
      "Google Analytics 연결이 필요합니다.",
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? defaultWait;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method,
        headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: options.signal,
      });
    } catch (reason) {
      if (options.signal?.aborted) throw reason;
      const networkError = new AnalyticsDataApiError(
        "network",
        "Google Analytics 서버에 연결하지 못했습니다.",
      );
      if (attempt < MAX_RETRIES) {
        await wait(250 * 2 ** attempt, options.signal);
        continue;
      }
      throw networkError;
    }

    if (!response.ok) {
      const responseError = await classifyResponseError(response);
      if (shouldRetry(responseError) && attempt < MAX_RETRIES) {
        await wait(
          responseError.retryAfterMs ?? 250 * 2 ** attempt,
          options.signal,
        );
        continue;
      }
      throw responseError;
    }

    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new AnalyticsDataApiError(
        "invalid-response",
        "Google Analytics 응답 형식을 확인할 수 없습니다.",
      );
    }
    return parsed.data;
  }

  throw new AnalyticsDataApiError(
    "service",
    "Google Analytics 보고서 요청을 완료하지 못했습니다.",
  );
}

async function requestAnalyticsData<T>(
  propertyId: string,
  method: AnalyticsDataApiMethod,
  body: object,
  schema: z.ZodMiniType<T>,
  options: AnalyticsDataApiOptions,
): Promise<T> {
  const normalizedPropertyId = assertPropertyId(propertyId);
  const root = ANALYTICS_DATA_API_ROOTS[METHOD_VERSIONS[method]];
  return performAnalyticsRequest(
    `${root}/properties/${normalizedPropertyId}:${method}`,
    { method: "POST", body: JSON.stringify(body) },
    schema,
    options,
  );
}
```

- [ ] **Step 5: Add the cohort, funnel and metadata types**

Insert after `AnalyticsFilterExpression` (currently lines 52–56) in the same file:

```ts
export type AnalyticsCohort = {
  name: string;
  /** GA4 supports no other cohort membership dimension. */
  dimension: "firstSessionDate";
  dateRange: { startDate: string; endDate: string };
};

export type AnalyticsCohortsRange = {
  granularity: "DAILY" | "WEEKLY" | "MONTHLY";
  startOffset: number;
  endOffset: number;
};

export type AnalyticsCohortSpec = {
  cohorts: readonly AnalyticsCohort[];
  cohortsRange: AnalyticsCohortsRange;
};

export type AnalyticsFunnelParameterFilter = {
  eventParameterName?: string;
  itemParameterName?: string;
  stringFilter?: AnalyticsStringFilter;
  inListFilter?: AnalyticsInListFilter;
};

export type AnalyticsFunnelParameterFilterExpression =
  | { funnelParameterFilter: AnalyticsFunnelParameterFilter }
  | {
      andGroup: {
        expressions: readonly AnalyticsFunnelParameterFilterExpression[];
      };
    }
  | {
      orGroup: {
        expressions: readonly AnalyticsFunnelParameterFilterExpression[];
      };
    }
  | { notExpression: AnalyticsFunnelParameterFilterExpression };

export type AnalyticsFunnelEventFilter = {
  eventName: string;
  funnelParameterFilterExpression?: AnalyticsFunnelParameterFilterExpression;
};

export type AnalyticsFunnelFilterExpression =
  | { funnelEventFilter: AnalyticsFunnelEventFilter }
  | { funnelFieldFilter: AnalyticsFieldFilter }
  | { andGroup: { expressions: readonly AnalyticsFunnelFilterExpression[] } }
  | { orGroup: { expressions: readonly AnalyticsFunnelFilterExpression[] } }
  | { notExpression: AnalyticsFunnelFilterExpression };

export type AnalyticsFunnelStep = {
  name: string;
  /**
   * Never sent by this app's builders — an unverified request field would ride
   * to production untested. Kept so a future step definition can opt in.
   */
  isDirectlyFollowedBy?: boolean;
  filterExpression: AnalyticsFunnelFilterExpression;
};

export type AnalyticsRunFunnelReportRequest = {
  dateRanges: readonly AnalyticsDateRangeRequest[];
  /** Omitting `isOpenFunnel` means a closed funnel, which is what we want. */
  funnel: { isOpenFunnel?: boolean; steps: readonly AnalyticsFunnelStep[] };
  funnelBreakdown?: {
    breakdownDimension: AnalyticsDimensionRequest;
    /** GA4 defaults to the first 5 distinct breakdown values. */
    limit?: number;
  };
  dimensionFilter?: AnalyticsFilterExpression;
  limit?: number;
  returnPropertyQuota?: boolean;
};
```

Then change `AnalyticsRunReportRequest` (lines 58–68) to:

```ts
export type AnalyticsRunReportRequest = {
  /** Absent on cohort requests — GA4 rejects `dateRanges` beside a `cohortSpec`. */
  dateRanges?: readonly AnalyticsDateRangeRequest[];
  dimensions?: readonly AnalyticsDimensionRequest[];
  metrics: readonly AnalyticsMetricRequest[];
  dimensionFilter?: AnalyticsFilterExpression;
  cohortSpec?: AnalyticsCohortSpec;
  orderBys?: readonly AnalyticsOrderByRequest[];
  limit?: number;
  offset?: number;
  keepEmptyRows?: boolean;
  returnPropertyQuota?: boolean;
};
```

- [ ] **Step 6: Add the funnel and metadata schemas**

Insert after `batchResponseSchema` (line 118) in the same file:

```ts
const funnelSubReportSchema = z.looseObject({
  dimensionHeaders: z.prefault(z.array(headerSchema), []),
  metricHeaders: z.prefault(z.array(metricHeaderSchema), []),
  rows: z.prefault(z.array(rowSchema), []),
  metadata: z.optional(
    z.looseObject({
      samplingMetadatas: z.optional(z.array(samplingMetadataSchema)),
    }),
  ),
});

const funnelResponseSchema = z.looseObject({
  funnelTable: z.optional(funnelSubReportSchema),
  funnelVisualization: z.optional(funnelSubReportSchema),
  /** Optional on purpose: `returnPropertyQuota` is not doc-confirmed for v1alpha. */
  propertyQuota: z.optional(z.record(z.string(), quotaEntrySchema)),
  kind: z.optional(z.string()),
});

const metadataFieldSchema = z.looseObject({
  apiName: z.string(),
  uiName: z.optional(z.string()),
  customDefinition: z.optional(z.boolean()),
});

const metadataResponseSchema = z.looseObject({
  name: z.optional(z.string()),
  dimensions: z.prefault(z.array(metadataFieldSchema), []),
  metrics: z.prefault(z.array(metadataFieldSchema), []),
});
```

and extend the inferred-type block at lines 130–131 to:

```ts
export type AnalyticsReportResponse = z.infer<typeof reportResponseSchema>;
export type AnalyticsBatchReportResponse = z.infer<typeof batchResponseSchema>;
export type AnalyticsFunnelSubReport = z.infer<typeof funnelSubReportSchema>;
export type AnalyticsFunnelReportResponse = z.infer<typeof funnelResponseSchema>;
export type AnalyticsMetadataResponse = z.infer<typeof metadataResponseSchema>;
```

- [ ] **Step 7: Teach `assertReportContract` about the implicit `dateRange` header, and add `assertFunnelContract`**

Replace `assertReportContract` (lines 299–325) with:

```ts
function assertReportContract(
  report: AnalyticsReportResponse,
  request: Pick<AnalyticsRunReportRequest, "dimensions" | "metrics" | "dateRanges">,
): void {
  // Two date ranges make GA4 append its own trailing `dateRange` dimension.
  // Accepting it unconditionally would hide a genuinely reordered response.
  const expectedDimensions = [
    ...(request.dimensions ?? []),
    ...((request.dateRanges?.length ?? 0) > 1
      ? [{ name: DATE_RANGE_DIMENSION }]
      : []),
  ];
  if (
    !hasOrderedNames(report.dimensionHeaders, expectedDimensions) ||
    !hasOrderedNames(report.metricHeaders, request.metrics)
  ) {
    invalidAnalyticsResponse();
  }

  for (const row of report.rows) {
    if (
      row.dimensionValues.length !== expectedDimensions.length ||
      row.metricValues.length !== request.metrics.length
    ) {
      invalidAnalyticsResponse();
    }
  }

  for (const total of report.totals) {
    if (total.metricValues.length !== request.metrics.length) {
      invalidAnalyticsResponse();
    }
  }
}

function assertFunnelContract(
  response: AnalyticsFunnelReportResponse,
  request: Pick<AnalyticsRunFunnelReportRequest, "funnelBreakdown">,
): asserts response is AnalyticsFunnelReportResponse & {
  funnelTable: AnalyticsFunnelSubReport;
} {
  const table = response.funnelTable;
  if (!table) invalidAnalyticsResponse();
  if (table.dimensionHeaders[0]?.name !== FUNNEL_STEP_DIMENSION) {
    invalidAnalyticsResponse();
  }

  const breakdownName = request.funnelBreakdown?.breakdownDimension.name;
  const expectedDimensionCount = breakdownName ? 2 : 1;
  if (
    table.dimensionHeaders.length !== expectedDimensionCount ||
    (breakdownName !== undefined &&
      table.dimensionHeaders[1]?.name !== breakdownName)
  ) {
    invalidAnalyticsResponse();
  }

  // Looked up by name, never by position: the four funnel metrics are stable
  // but their order is GA4's business, not ours.
  const metricNames = new Set(table.metricHeaders.map(({ name }) => name));
  for (const metric of FUNNEL_METRICS) {
    if (!metricNames.has(metric)) invalidAnalyticsResponse();
  }

  for (const row of table.rows) {
    if (
      row.dimensionValues.length !== table.dimensionHeaders.length ||
      row.metricValues.length !== table.metricHeaders.length
    ) {
      invalidAnalyticsResponse();
    }
  }
}
```

- [ ] **Step 8: Export the two new runners**

Append to the end of `src/features/analytics/analytics-data-api.ts`:

```ts
export async function runAnalyticsFunnelReport(
  propertyId: string,
  request: AnalyticsRunFunnelReportRequest,
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsFunnelReportResponse> {
  const response = await requestAnalyticsData(
    propertyId,
    "runFunnelReport",
    request,
    funnelResponseSchema,
    options,
  );
  assertFunnelContract(response, request);
  return response;
}

/**
 * The property's own dimension and metric catalogue.
 *
 * Used to answer one question honestly: has this property registered the
 * `account_type` user-scoped custom dimension? Guessing "yes" and letting the
 * report 400 would tell an operator their filter is broken instead of that a
 * GA4 custom definition is missing.
 */
export async function getAnalyticsMetadata(
  propertyId: string,
  options: AnalyticsDataApiOptions,
): Promise<AnalyticsMetadataResponse> {
  const normalizedPropertyId = assertPropertyId(propertyId);
  return performAnalyticsRequest(
    `${ANALYTICS_DATA_API_ROOTS.v1beta}/properties/${normalizedPropertyId}/metadata`,
    { method: "GET" },
    metadataResponseSchema,
    options,
  );
}
```

- [ ] **Step 9: Run the file's tests and make them pass**

Run: `npx vitest run src/features/analytics/analytics-data-api.test.ts`
Expected: PASS (all pre-existing cases plus the five new ones).

- [ ] **Step 10: Run the two consumers that share this module**

Run: `npx vitest run src/features/analytics/analytics-reports.test.ts src/features/analytics/user-behavior-report.test.ts`
Expected: PASS — `dateRanges` becoming optional and the extracted request helper must not change any existing behaviour.

- [ ] **Step 11: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics
git rev-parse --abbrev-ref HEAD   # must print feat/analytics-analysis
git add src/features/analytics/analytics-data-api.ts src/features/analytics/analytics-data-api.test.ts
git commit -m "$(cat <<'MSG'
feat(analytics): route runFunnelReport to v1alpha and add cohort/metadata requests

runFunnelReport only exists on v1alpha, so the client now picks a base URL by
method instead of hard-coding one root. The fetch/retry/parse loop moves into
performAnalyticsRequest so the metadata GET shares the same error taxonomy.

assertReportContract accepts GA4's implicit trailing dateRange dimension only
when the request actually asked for two ranges, and assertFunnelContract checks
funnelStepName, the requested breakdown header and all four funnel metrics by
name — the two rate metrics arrive typed TYPE_INTEGER but hold fractions.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 2: Pure modules — shaping, formatting, filters, quota, funnel, retention, insights

This task is large because every rule this feature adds lives in a pure, separately-tested module. It has **two commit checkpoints** — 2A (shared extraction: types, labels, shaping, format, filters, quota) at Step 13 and 2B (the four analysis modules) at Step 30 — so a reviewer can accept or reject the extraction independently of the new analysis rules.

**Files:**
- Modify: `src/features/analytics/types.ts` (whole file — view union, quota category, trend/platform/insight/funnel/retention types)
- Modify: `src/features/analytics/analytics-labels.ts` (append `APP_EVENTS`, `isKnownAppEvent`)
- Create: `src/features/analytics/analytics-report-shaping.ts` + `.test.ts`
- Create: `src/features/analytics/analytics-format.ts` + `.test.ts`
- Create: `src/features/analytics/analytics-filters.ts` + `.test.ts`
- Create: `src/features/analytics/analytics-quota.ts` + `.test.ts`
- Create: `src/features/analytics/funnel-definitions.ts` + `.test.ts`
- Create: `src/features/analytics/analytics-funnel.ts` + `.test.ts`
- Create: `src/features/analytics/analytics-retention.ts` + `.test.ts`
- Create: `src/features/analytics/analytics-insights.ts` + `.test.ts`
- Modify: `src/features/analytics/analytics-reports.ts` (delete the moved helpers, import them instead — the file's exported behaviour does not change in this task)
- Modify: `src/features/analytics/user-behavior-report.ts:7,402` (import shaping helpers from their new home; drop its private `quotaFromResponses` / `dedupeNotices`)
- Modify: `src/features/analytics/AnalyticsDashboard.tsx` (delete the private `formatMetric` / `percentChange` / `formatGaDate` at lines 579–615, import them instead)

**Interfaces:**
- Consumes (Task 1): `runAnalyticsFunnelReport`, `FUNNEL_METRICS`, `FUNNEL_STEP_DIMENSION`, types `AnalyticsRunReportRequest` (now with optional `dateRanges` and `cohortSpec`), `AnalyticsRunFunnelReportRequest`, `AnalyticsFunnelSubReport`, `AnalyticsFunnelFilterExpression`, `AnalyticsFunnelParameterFilterExpression`, `AnalyticsFilterExpression`, `AnalyticsDataApiOptions`, `AnalyticsReportResponse`, `AnalyticsDataApiError`, and the pre-existing `runAnalyticsReport`.
- Produces, for Tasks 3–5 (exact signatures):

```ts
// analytics-report-shaping.ts
export const RANGE_DAYS: Record<AnalyticsDateRange, number>;
export function analyticsDateRange(range: AnalyticsDateRange, previous?: boolean): { startDate: string; endDate: string };
export function assertFiniteNumericString(value: string | undefined): asserts value is string;
export function numericValue(value: string | undefined): number;
export function firstMetric(report: AnalyticsReportResponse | undefined, metricName: string): number;
export function reportRows(report: AnalyticsReportResponse): Array<Record<string, string>>;
export function emptyReport(): AnalyticsReportResponse;
export type AnalyticsReportScope = { key: string; title: string };
export type ReportQualityMetadata = { subjectToThresholding?: boolean; dataLossFromOtherRow?: boolean; samplingMetadatas?: ReadonlyArray<{ samplesReadCount: string; samplingSpaceSize: string }> };
export function dataQualityNoticesForReport(metadata: ReportQualityMetadata | undefined, scope: AnalyticsReportScope): AnalyticsDataQualityNotice[];
export function dedupeDataQualityNotices(notices: readonly AnalyticsDataQualityNotice[]): AnalyticsDataQualityNotice[];
export function quotaFromReports(reports: readonly { propertyQuota?: Record<string, { consumed: number; remaining: number }> }[], category: AnalyticsQuotaCategory): AnalyticsQuotaState | null;
export function currencyFromReports(reports: readonly { metadata?: { currencyCode?: string } }[]): string;

// analytics-format.ts
export function formatMetric(value: number, format: AnalyticsMetricValue["format"], currencyCode: string): string;
export function percentChange(value: number, previous: number | undefined): number | null;
export function formatGaDate(value: string): string;              // "20260830" -> "2026.08.30"
export function formatCount(value: number): string;               // 1240 -> "1,240"
export function formatRate(rate: number | null): string;          // 0.412 -> "41.2%", null -> "—"
export function formatSignificantPercent(value: number): string;  // 32 -> "32%", 6.2 -> "6.2%"
export function formatPercentPoints(value: number): string;       // 6.2 -> "6.2%p", 12 -> "12%p"

// analytics-filters.ts
export const ANALYTICS_PLATFORMS: readonly ["iOS", "Android", "web"];
export type AnalyticsPlatform = "iOS" | "Android" | "web";
export type AnalyticsAccountType = "all" | "consumer" | "business";
export type AnalyticsFilters = { platforms: readonly AnalyticsPlatform[]; accountType: AnalyticsAccountType };
export const ACCOUNT_TYPE_DIMENSION = "customUser:account_type";
export const EMPTY_FILTERS: AnalyticsFilters;
export function filtersKey(filters: AnalyticsFilters): string;
export function activeFilterCount(filters: AnalyticsFilters): number;
export function togglePlatform(filters: AnalyticsFilters, platform: AnalyticsPlatform): AnalyticsFilters;
export function buildDimensionFilter(filters: AnalyticsFilters): AnalyticsFilterExpression | undefined;
export function availablePlatforms(platform: AnalyticsPropertyPlatform): readonly AnalyticsPlatform[];
export function normalizePlatform(value: string): string;

// analytics-quota.ts
export const QUOTA_POOL_LABELS: Record<AnalyticsQuotaCategory, string>;
export const QUOTA_LOW_RATIO: 0.1;
export type AnalyticsQuotaPressure = { level: "ok" | "low" | "exhausted"; scope: "hour" | "day" | null; key: string | null; ratio: number | null };
export function quotaPressure(quota: AnalyticsQuotaState | null): AnalyticsQuotaPressure;

// funnel-definitions.ts
export const FUNNEL_IDS: readonly ["party-apply", "party-payment", "onboarding"];
export type FunnelId = (typeof FUNNEL_IDS)[number];
export type FunnelStepDefinition = { name: string; filterExpression: AnalyticsFunnelFilterExpression };
export type FunnelDefinition = { id: FunnelId; title: string; description: string; steps: FunnelStepDefinition[] };
export const FUNNEL_DEFINITIONS: Record<FunnelId, FunnelDefinition>;
export const FUNNEL_BREAKDOWN_DIMENSION: "platform";
export const FUNNEL_BREAKDOWN_LIMIT: 5;
export function isFunnelId(value: string): value is FunnelId;
export function eventStep(name: string, eventName: string): FunnelStepDefinition;
export function screenStep(name: string, screen: string): FunnelStepDefinition;
export function mutationStep(name: string, input: { routes: readonly string[]; method: string; result: string }): FunnelStepDefinition;
export function buildFunnelRequest(definition: FunnelDefinition, range: AnalyticsDateRange, filters: AnalyticsFilters, breakdown: boolean): AnalyticsRunFunnelReportRequest;

// analytics-funnel.ts
export const FUNNEL_TOTAL_VALUE: "RESERVED_TOTAL";
export function shapeFunnel(table: AnalyticsFunnelSubReport, definition: FunnelDefinition, breakdown: boolean): { steps: AnalyticsFunnelStepResult[]; breakdown: AnalyticsFunnelResult["breakdown"] };
export function fetchFunnel(input: FetchFunnelInput): Promise<AnalyticsFunnelResult>;

// analytics-retention.ts
export const RETENTION_COHORT_COUNT: 6;
export const RETENTION_HORIZON: 4;
export type RetentionCohortRange = { name: string; startDate: string; endDate: string };
export function buildWeeklyCohorts(now: Date, weeks?: number): RetentionCohortRange[];
export function retentionYesterday(now: Date): string;
export function buildRetentionRequest(cohorts: readonly RetentionCohortRange[], dimensionFilter?: AnalyticsFilterExpression): AnalyticsRunReportRequest;
export function shapeRetention(report: AnalyticsReportResponse, cohorts: readonly RetentionCohortRange[], yesterday: string): AnalyticsRetentionCohort[];
export function fetchRetention(input: FetchRetentionInput): Promise<AnalyticsRetentionResult>;

// analytics-insights.ts
export const DEFAULT_INSIGHT_THRESHOLDS: { totalDeltaPercent: 20; totalBaseUsers: 50; revenueBase: 1; engagementPointDelta: 5; platformDeltaPercent: 25; platformBaseUsers: 30; shareShiftPoints: 10; maxInsights: 5 };
export type InsightThresholds = typeof DEFAULT_INSIGHT_THRESHOLDS;
export function buildInsights(input: { metrics: readonly AnalyticsMetricValue[]; platforms: readonly AnalyticsPlatformBreakdown[]; currencyCode: string }, thresholds?: InsightThresholds): AnalyticsInsight[];
```

**Verified deviations from the spec, applied here:**
1. The spec asked for a new `analytics-events.ts` holding `APP_EVENTS` + `EVENT_LABELS`. `analytics-labels.ts` already owns `EVENT_LABELS` and is imported by two screens; `APP_EVENTS` is appended there instead. One module, one source.
2. `dataQualityNoticesForReport` takes the **metadata object**, not the report. The funnel sub-report's metadata has a narrower shape than a run-report's, and a metadata-first signature types both call sites exactly instead of relying on structural assignability through two `looseObject` index signatures.
3. The spec's retention test pins the clock with `vi.setSystemTime("2026-09-08T03:00:00+09:00")`. `vitest.config.ts` sets no `TZ`, and `buildWeeklyCohorts` reads **local** calendar fields, so that string would produce a different calendar day outside KST. The tests build the date from local components (`new Date(2026, 8, 8, 12, 0, 0)`) and pass it in explicitly. Same expected cohorts (`2026-07-26` … `2026-08-30`), machine-independent.
4. `metricFilter` is **not** added to `AnalyticsRunReportRequest`. Nothing in this feature sends one, and an optional request field no test exercises is a promise the code does not keep.
5. `RANGE_DAYS` and the relative-date-range helper move out of `analytics-reports.ts` into `analytics-report-shaping.ts`, because `funnel-definitions.ts` needs the same date range and must not import the report composer (that would be a cycle).

Read first: `src/features/analytics/analytics-reports.ts:101-225` (the helpers being moved, verbatim) and `src/features/analytics/user-behavior-report.ts:342-373` (the duplicate quota merge and notice dedupe being deleted).

---

#### 2A — shared extraction

- [ ] **Step 1: Extend `types.ts`**

Replace the top of `src/features/analytics/types.ts` (lines 1–13) with:

```ts
export const ANALYTICS_VIEWS = [
  "overview",
  "acquisition",
  "engagement",
  "conversion-revenue",
  "funnel",
  "retention",
  "realtime",
] as const;

export type AnalyticsReportView = (typeof ANALYTICS_VIEWS)[number];

export const ANALYTICS_DATE_RANGES = ["7d", "28d", "90d"] as const;

export type AnalyticsDateRange = (typeof ANALYTICS_DATE_RANGES)[number];
```

Replace `AnalyticsQuotaState` (lines 29–31) with:

```ts
/** Which GA4 token pool the numbers came from. Core, Realtime and Funnel are billed separately. */
export type AnalyticsQuotaCategory = "core" | "realtime" | "funnel";

export type AnalyticsQuotaState = {
  category: AnalyticsQuotaCategory;
  entries: AnalyticsQuotaEntry[];
};
```

Replace `AnalyticsOverviewResult` (lines 72–80) and the closing `AnalyticsReportResult` (line 92) with everything below, keeping `AnalyticsTableResult` (lines 82–90) unchanged:

```ts
export const ANALYTICS_TREND_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
] as const;

export type AnalyticsTrendMetric = (typeof ANALYTICS_TREND_METRICS)[number];

export type AnalyticsTrendValues = Record<AnalyticsTrendMetric, number>;

export type AnalyticsTrendPoint = {
  /** `YYYYMMDD` in the current range. */
  date: string;
  /** `YYYYMMDD` in the previous range, aligned by position — `null` when the previous range is shorter. */
  previousDate: string | null;
  current: AnalyticsTrendValues;
  previous: AnalyticsTrendValues | null;
};

export type AnalyticsTrendSeries = { points: AnalyticsTrendPoint[] };

export type AnalyticsPlatformBreakdown = {
  platform: string;
  current: AnalyticsTrendValues;
  previous: AnalyticsTrendValues;
};

export type AnalyticsInsightSeverity = "warning" | "positive" | "info";

export type AnalyticsInsight = {
  id: string;
  severity: AnalyticsInsightSeverity;
  text: string;
  metric: string;
  scope: "total" | "platform";
  /** Percent for count metrics, percentage points for rate metrics, `null` when not comparable. */
  delta: number | null;
  current: number;
  previous: number;
};

export type AnalyticsOverviewResult = {
  view: "overview";
  metrics: AnalyticsMetricValue[];
  series: AnalyticsTrendSeries;
  platforms: AnalyticsPlatformBreakdown[];
  insights: AnalyticsInsight[];
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsFunnelStepResult = {
  index: number;
  name: string;
  users: number;
  /** Fractions, as GA4 reports them: 0.412 is 41.2 %. `null` on the last step. */
  completionRate: number | null;
  abandonments: number | null;
  abandonmentRate: number | null;
  /** `users / steps[0].users`, 0 when the first step had no users. */
  shareOfFirst: number;
};

export type AnalyticsFunnelBreakdownRow = {
  value: string;
  steps: AnalyticsFunnelStepResult[];
};

export type AnalyticsFunnelResult = {
  view: "funnel";
  /** A `FunnelId` from `funnel-definitions.ts`; typed loosely so `types.ts` stays dependency-free. */
  funnelId: string;
  title: string;
  description: string;
  steps: AnalyticsFunnelStepResult[];
  breakdown: {
    dimension: "platform";
    rows: AnalyticsFunnelBreakdownRow[];
  } | null;
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsRetentionCellState = "complete" | "partial" | "future";

export type AnalyticsRetentionCell = {
  week: number;
  activeUsers: number;
  /** `activeUsers / totalUsers`, `null` when the cohort is empty. */
  rate: number | null;
  state: AnalyticsRetentionCellState;
};

export type AnalyticsRetentionCohort = {
  /** The cohort's ISO start date, which is also the `Cohort.name` sent to GA4. */
  name: string;
  startDate: string;
  endDate: string;
  totalUsers: number;
  cells: AnalyticsRetentionCell[];
};

export type AnalyticsRetentionResult = {
  view: "retention";
  granularity: "WEEKLY";
  horizon: number;
  cohorts: AnalyticsRetentionCohort[];
  currencyCode: string;
  quota: AnalyticsQuotaState | null;
  dataQualityNotices: AnalyticsDataQualityNotice[];
  isEmpty: boolean;
};

export type AnalyticsReportResult =
  | AnalyticsOverviewResult
  | AnalyticsTableResult
  | AnalyticsFunnelResult
  | AnalyticsRetentionResult;
```

- [ ] **Step 2: Append the event vocabulary to `analytics-labels.ts`**

Append to `src/features/analytics/analytics-labels.ts`:

```ts
/**
 * Every event name this admin knows the Dopa app or web sends.
 *
 * Derived from `EVENT_LABELS` so the two can never drift. Funnel definitions
 * assert against this list: a funnel step naming an event the app never emits
 * renders a silent zero, and an operator reads that as "nobody applied".
 */
export const APP_EVENTS: readonly string[] = Object.keys(EVENT_LABELS);

export function isKnownAppEvent(name: string): boolean {
  return Object.hasOwn(EVENT_LABELS, name);
}
```

- [ ] **Step 3: Type-check the two edits**

Run: `npx tsc --noEmit`
Expected: FAIL, and only with errors about `AnalyticsQuotaState` now needing `category` (in `analytics-reports.ts` and `user-behavior-report.ts`) and `AnalyticsOverviewResult.trend` being gone (in `analytics-reports.ts`, `AnalyticsDashboard.tsx`). Those are fixed by Steps 5, 8 and Task 3 — record the list so you can confirm nothing else broke.

- [ ] **Step 4: Write the failing shaping test**

Create `src/features/analytics/analytics-report-shaping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AnalyticsDataApiError } from "./analytics-data-api";
import type { AnalyticsReportResponse } from "./analytics-data-api";
import {
  RANGE_DAYS,
  analyticsDateRange,
  currencyFromReports,
  dataQualityNoticesForReport,
  dedupeDataQualityNotices,
  emptyReport,
  firstMetric,
  numericValue,
  quotaFromReports,
  reportRows,
} from "./analytics-report-shaping";

function report(
  overrides: Partial<AnalyticsReportResponse> = {},
): AnalyticsReportResponse {
  return { ...emptyReport(), ...overrides };
}

describe("analyticsDateRange", () => {
  it("keeps the current and previous windows adjacent and non-overlapping", () => {
    expect(RANGE_DAYS).toEqual({ "7d": 7, "28d": 28, "90d": 90 });
    expect(analyticsDateRange("28d")).toEqual({
      startDate: "28daysAgo",
      endDate: "yesterday",
    });
    expect(analyticsDateRange("28d", true)).toEqual({
      startDate: "56daysAgo",
      endDate: "29daysAgo",
    });
  });
});

describe("numericValue", () => {
  it.each(["", " ", "not-a-number", "Infinity", undefined])(
    "refuses %p instead of presenting it as a real zero",
    (value) => {
      expect(() => numericValue(value)).toThrow(AnalyticsDataApiError);
      try {
        numericValue(value);
      } catch (reason) {
        expect((reason as AnalyticsDataApiError).kind).toBe("invalid-response");
      }
    },
  );

  it("accepts GA4's zero-padded and fractional strings", () => {
    expect(numericValue("0000")).toBe(0);
    expect(numericValue("0.412")).toBeCloseTo(0.412);
    expect(numericValue("-3")).toBe(-3);
  });
});

describe("reportRows", () => {
  it("flattens a row into one record keyed by header name", () => {
    const rows = reportRows(
      report({
        dimensionHeaders: [{ name: "date" }, { name: "dateRange" }],
        metricHeaders: [{ name: "sessions" }],
        rows: [
          {
            dimensionValues: [{ value: "20260901" }, { value: "current" }],
            metricValues: [{ value: "12" }],
          },
        ],
      }),
    );

    expect(rows).toEqual([
      { date: "20260901", dateRange: "current", sessions: "12" },
    ]);
  });
});

describe("firstMetric", () => {
  it("reads a named metric from the first row and falls back to totals", () => {
    const withRow = report({
      metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
      rows: [{ dimensionValues: [], metricValues: [{ value: "8" }, { value: "5" }] }],
    });
    const withTotalsOnly = report({
      metricHeaders: [{ name: "sessions" }],
      totals: [{ dimensionValues: [], metricValues: [{ value: "9" }] }],
    });

    expect(firstMetric(withRow, "activeUsers")).toBe(5);
    expect(firstMetric(withTotalsOnly, "sessions")).toBe(9);
    expect(firstMetric(withRow, "keyEvents")).toBe(0);
    expect(firstMetric(undefined, "sessions")).toBe(0);
  });
});

describe("quotaFromReports", () => {
  it("keeps the worst remaining figure per key and tags the pool", () => {
    const quota = quotaFromReports(
      [
        { propertyQuota: { tokensPerHour: { consumed: 10, remaining: 100 } } },
        {
          propertyQuota: {
            tokensPerHour: { consumed: 25, remaining: 40 },
            tokensPerDay: { consumed: 25, remaining: 900 },
          },
        },
      ],
      "funnel",
    );

    expect(quota).toEqual({
      category: "funnel",
      entries: [
        { key: "tokensPerDay", consumed: 25, remaining: 900 },
        { key: "tokensPerHour", consumed: 25, remaining: 40 },
      ],
    });
    expect(quotaFromReports([{}], "core")).toBeNull();
  });
});

describe("dataQualityNoticesForReport", () => {
  const scope = { key: "channels", title: "채널" };

  it("reports thresholding, sampling and (other)-row merging in that order", () => {
    expect(
      dataQualityNoticesForReport(
        {
          subjectToThresholding: true,
          dataLossFromOtherRow: true,
          samplingMetadatas: [
            { samplesReadCount: "12500", samplingSpaceSize: "50000" },
          ],
        },
        scope,
      ),
    ).toEqual([
      { kind: "thresholding", reportKey: "channels", reportTitle: "채널" },
      {
        kind: "sampling",
        reportKey: "channels",
        reportTitle: "채널",
        samplesReadCount: "12500",
        samplingSpaceSize: "50000",
      },
      { kind: "other-row", reportKey: "channels", reportTitle: "채널" },
    ]);
    expect(dataQualityNoticesForReport(undefined, scope)).toEqual([]);
  });

  it("collapses the identical notice repeated across paged responses", () => {
    const notice = {
      kind: "thresholding",
      reportKey: "channels",
      reportTitle: "채널",
    } as const;

    expect(dedupeDataQualityNotices([notice, { ...notice }])).toEqual([notice]);
  });
});

describe("currencyFromReports", () => {
  it("uses the first reported currency and defaults to KRW", () => {
    expect(
      currencyFromReports([{}, { metadata: { currencyCode: "USD" } }]),
    ).toBe("USD");
    expect(currencyFromReports([{}])).toBe("KRW");
  });
});
```

- [ ] **Step 5: Run it, watch it fail, then create the module**

Run: `npx vitest run src/features/analytics/analytics-report-shaping.test.ts`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/analytics-report-shaping.ts`:

```ts
import {
  AnalyticsDataApiError,
  type AnalyticsReportResponse,
} from "./analytics-data-api";
import type {
  AnalyticsDataQualityNotice,
  AnalyticsDateRange,
  AnalyticsQuotaCategory,
  AnalyticsQuotaState,
} from "./types";

/**
 * The primitives every report module shares: relative date windows, strict
 * numeric parsing, row flattening, quota merging and GA4's data-quality
 * signals. They live apart from `analytics-reports.ts` because the funnel and
 * retention modules need them and must not import the composer that imports
 * them back.
 */

export const RANGE_DAYS: Record<AnalyticsDateRange, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

/**
 * The previous window ends the day before the current one starts, so the two
 * never share a day. `yesterday` rather than `today`: GA4's current day is
 * still filling up, and a half-day would read as a collapse.
 */
export function analyticsDateRange(
  range: AnalyticsDateRange,
  previous = false,
): { startDate: string; endDate: string } {
  const days = RANGE_DAYS[range];
  return previous
    ? { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }
    : { startDate: `${days}daysAgo`, endDate: "yesterday" };
}

export function assertFiniteNumericString(
  value: string | undefined,
): asserts value is string {
  const parsed =
    typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    throw new AnalyticsDataApiError(
      "invalid-response",
      "Google Analytics 응답에 올바르지 않은 숫자 값이 포함되어 있습니다.",
    );
  }
}

export function numericValue(value: string | undefined): number {
  assertFiniteNumericString(value);
  return Number(value);
}

export function firstMetric(
  report: AnalyticsReportResponse | undefined,
  metricName: string,
): number {
  if (!report) return 0;
  const metricIndex = report.metricHeaders.findIndex(
    ({ name }) => name === metricName,
  );
  if (metricIndex < 0) return 0;
  const row = report.rows[0] ?? report.totals[0];
  if (!row) return 0;
  return numericValue(row.metricValues[metricIndex]?.value);
}

export function reportRows(
  report: AnalyticsReportResponse,
): Array<Record<string, string>> {
  return report.rows.map((row) => {
    const output: Record<string, string> = {};
    report.dimensionHeaders.forEach(({ name }, index) => {
      output[name] = row.dimensionValues[index]?.value ?? "";
    });
    report.metricHeaders.forEach(({ name }, index) => {
      const value = row.metricValues[index]?.value;
      assertFiniteNumericString(value);
      output[name] = value;
    });
    return output;
  });
}

export function emptyReport(): AnalyticsReportResponse {
  return {
    dimensionHeaders: [],
    metricHeaders: [],
    rows: [],
    totals: [],
    rowCount: 0,
  };
}

export type AnalyticsReportScope = { key: string; title: string };

export type ReportQualityMetadata = {
  subjectToThresholding?: boolean;
  dataLossFromOtherRow?: boolean;
  samplingMetadatas?: ReadonlyArray<{
    samplesReadCount: string;
    samplingSpaceSize: string;
  }>;
};

export function dataQualityNoticesForReport(
  metadata: ReportQualityMetadata | undefined,
  scope: AnalyticsReportScope,
): AnalyticsDataQualityNotice[] {
  if (!metadata) return [];
  const reportScope = { reportKey: scope.key, reportTitle: scope.title };
  const notices: AnalyticsDataQualityNotice[] = [];

  if (metadata.subjectToThresholding === true) {
    notices.push({ ...reportScope, kind: "thresholding" });
  }
  for (const sampling of metadata.samplingMetadatas ?? []) {
    notices.push({
      ...reportScope,
      kind: "sampling",
      samplesReadCount: sampling.samplesReadCount,
      samplingSpaceSize: sampling.samplingSpaceSize,
    });
  }
  if (metadata.dataLossFromOtherRow === true) {
    notices.push({ ...reportScope, kind: "other-row" });
  }
  return notices;
}

export function dedupeDataQualityNotices(
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

type QuotaCarrier = {
  propertyQuota?: Record<string, { consumed: number; remaining: number }>;
};

/**
 * Merges the quota snapshots of a batch pessimistically: the highest consumed
 * and the lowest remaining. An optimistic merge would tell an operator they
 * have room right before the next request fails.
 */
export function quotaFromReports(
  reports: readonly QuotaCarrier[],
  category: AnalyticsQuotaCategory,
): AnalyticsQuotaState | null {
  const byKey = new Map<string, { consumed: number; remaining: number }>();
  for (const report of reports) {
    for (const [key, entry] of Object.entries(report.propertyQuota ?? {})) {
      const existing = byKey.get(key);
      byKey.set(key, {
        consumed: Math.max(existing?.consumed ?? 0, entry.consumed),
        remaining: Math.min(
          existing?.remaining ?? Number.MAX_SAFE_INTEGER,
          entry.remaining,
        ),
      });
    }
  }
  if (byKey.size === 0) return null;
  return {
    category,
    entries: Array.from(byKey, ([key, entry]) => ({ key, ...entry })).sort(
      (a, b) => a.key.localeCompare(b.key),
    ),
  };
}

export function currencyFromReports(
  reports: readonly { metadata?: { currencyCode?: string } }[],
): string {
  return (
    reports.find((report) => report.metadata?.currencyCode)?.metadata
      ?.currencyCode ?? "KRW"
  );
}
```

- [ ] **Step 6: Run it and make it pass**

Run: `npx vitest run src/features/analytics/analytics-report-shaping.test.ts`
Expected: PASS

- [ ] **Step 7: Point the two existing consumers at the new module**

In `src/features/analytics/analytics-reports.ts`, delete `assertFiniteNumericString`, `numericValue`, `firstMetric`, `reportRows`, `dataQualityNoticesForReport`, `quotaFromReports`, `currencyFromReports`, `emptyReport`, `RANGE_DAYS` and `dateRange` (lines 37–41, 86–91, 101–139, 169–192, 204–225, 425–433) and add the import:

```ts
import {
  RANGE_DAYS,
  analyticsDateRange,
  currencyFromReports,
  dataQualityNoticesForReport,
  emptyReport,
  firstMetric,
  numericValue,
  quotaFromReports,
  reportRows,
} from "./analytics-report-shaping";
```

Then, inside this file only: replace every `dateRange(` call with `analyticsDateRange(`; change `dataQualityNoticesFromReports` to pass metadata and forward a category, i.e.

```ts
function dataQualityNoticesFromReports(
  reports: readonly { metadata?: ReportQualityMetadata }[],
  definitions: ReadonlyArray<AnalyticsReportScope>,
): AnalyticsDataQualityNotice[] {
  return reports.flatMap((report, index) => {
    const definition = definitions[index];
    return definition
      ? dataQualityNoticesForReport(report.metadata, definition)
      : [];
  });
}
```

(import `type AnalyticsReportScope` and `type ReportQualityMetadata` from `./analytics-report-shaping`), and give the three `quotaFromReports(...)` call sites their pool: `"core"` in `fetchOverview` and `fetchCoreTables`, `"realtime"` in `fetchRealtime`.

In `src/features/analytics/user-behavior-report.ts`: change line 7 to

```ts
import {
  dataQualityNoticesForReport,
  dedupeDataQualityNotices,
  quotaFromReports,
} from "./analytics-report-shaping";
```

delete its private `quotaFromResponses` and `dedupeNotices` (lines 342–373), change line 402 to `notices.push(...dataQualityNoticesForReport(response.metadata, REPORT_DEFINITION));`, and in `fetchUserBehaviorFlow`'s return change `quota: quotaFromResponses(responses)` → `quota: quotaFromReports(responses, "core")` and `dataQualityNotices: dedupeNotices(notices)` → `dataQualityNotices: dedupeDataQualityNotices(notices)`.

- [ ] **Step 8: Run both consumers' suites**

Run: `npx vitest run src/features/analytics/analytics-reports.test.ts src/features/analytics/user-behavior-report.test.ts src/features/analytics/UserBehaviorPanel.test.tsx`
Expected: PASS. `analytics-reports.test.ts` still asserts `28daysAgo`/`56daysAgo`, which `analyticsDateRange` reproduces exactly.

- [ ] **Step 9: Write the failing format test**

Create `src/features/analytics/analytics-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatGaDate,
  formatMetric,
  formatPercentPoints,
  formatRate,
  formatSignificantPercent,
  percentChange,
} from "./analytics-format";

describe("formatMetric", () => {
  it.each([
    [1240, "integer", "1,240"],
    [0.512, "percent", "51.2%"],
    [30000, "currency", "₩30,000"],
    [95, "duration", "1.6분"],
    [7200, "duration", "2.0시간"],
    [45, "duration", "45초"],
  ] as const)("formats %p as %s", (value, format, expected) => {
    expect(formatMetric(value, format, "KRW")).toBe(expected);
  });

  it("falls back to a suffixed amount when the currency code is not a real one", () => {
    expect(formatMetric(1500, "currency", "NOT-A-CODE")).toBe("1,500 NOT-A-CODE");
  });

  it("never renders NaN or Infinity as a number", () => {
    expect(formatMetric(Number.NaN, "integer", "KRW")).toBe("0");
    expect(formatMetric(Number.POSITIVE_INFINITY, "integer", "KRW")).toBe("0");
  });
});

describe("percentChange", () => {
  it("returns null when there is nothing to compare against", () => {
    expect(percentChange(10, undefined)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
  });

  it("measures change against the magnitude of the previous value", () => {
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(80, 100)).toBeCloseTo(-20);
  });
});

describe("formatGaDate", () => {
  it("renders GA4's compact date and leaves anything else untouched", () => {
    expect(formatGaDate("20260830")).toBe("2026.08.30");
    expect(formatGaDate("(other)")).toBe("(other)");
  });
});

describe("percent helpers", () => {
  it.each([
    [0.412, "41.2%"],
    [1, "100.0%"],
    [0, "0.0%"],
  ] as const)("renders the fraction %p as %s", (rate, expected) => {
    expect(formatRate(rate)).toBe(expected);
  });

  it("marks an incomparable rate rather than printing a zero", () => {
    expect(formatRate(null)).toBe("—");
  });

  it.each([
    [32, "32%"],
    [-32, "32%"],
    [10, "10%"],
    [9.94, "9.9%"],
    [6.2, "6.2%"],
  ] as const)("drops the decimal on %p once it is 10 or more", (value, expected) => {
    expect(formatSignificantPercent(value)).toBe(expected);
  });

  it.each([
    [6.2, "6.2%p"],
    [-6.2, "6.2%p"],
    [12, "12%p"],
  ] as const)("renders %p as %s", (value, expected) => {
    expect(formatPercentPoints(value)).toBe(expected);
  });
});

describe("formatCount", () => {
  it("groups thousands the Korean way", () => {
    expect(formatCount(1240)).toBe("1,240");
    expect(formatCount(0)).toBe("0");
  });
});
```

- [ ] **Step 10: Run it, watch it fail, then create the module**

Run: `npx vitest run src/features/analytics/analytics-format.test.ts`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/analytics-format.ts`:

```ts
import type { AnalyticsMetricValue } from "./types";

/**
 * One place where a GA4 number becomes Korean text.
 *
 * Percentages are shown to one decimal below 10 and as whole numbers above it:
 * "9.9%" carries information, "32.4%" only carries noise into a summary
 * sentence an operator reads at a glance.
 */

const INTEGER_FORMAT = new Intl.NumberFormat("ko-KR");

export function formatCount(value: number): string {
  return INTEGER_FORMAT.format(Number.isFinite(value) ? Math.round(value) : 0);
}

export function formatMetric(
  value: number,
  format: AnalyticsMetricValue["format"],
  currencyCode: string,
): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (format === "percent") {
    return new Intl.NumberFormat("ko-KR", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(safeValue);
  }
  if (format === "currency") {
    try {
      return new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(safeValue);
    } catch {
      return `${safeValue.toLocaleString("ko-KR")} ${currencyCode}`;
    }
  }
  if (format === "duration") {
    if (safeValue >= 3600) return `${(safeValue / 3600).toFixed(1)}시간`;
    if (safeValue >= 60) return `${(safeValue / 60).toFixed(1)}분`;
    return `${Math.round(safeValue).toLocaleString("ko-KR")}초`;
  }
  return formatCount(safeValue);
}

export function percentChange(
  value: number,
  previous: number | undefined,
): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * 100;
}

export function formatGaDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

/** GA4 rates are fractions: 0.412 is 41.2 %. */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatSignificantPercent(value: number): string {
  const magnitude = Math.abs(Number.isFinite(value) ? value : 0);
  return magnitude >= 10
    ? `${Math.round(magnitude)}%`
    : `${magnitude.toFixed(1)}%`;
}

export function formatPercentPoints(value: number): string {
  const magnitude = Math.abs(Number.isFinite(value) ? value : 0);
  return magnitude >= 10
    ? `${Math.round(magnitude)}%p`
    : `${magnitude.toFixed(1)}%p`;
}
```

- [ ] **Step 11: Make it pass and drop the dashboard's private copies**

Run: `npx vitest run src/features/analytics/analytics-format.test.ts`
Expected: PASS

Then in `src/features/analytics/AnalyticsDashboard.tsx` delete `formatMetric` (579–605), `percentChange` (607–610) and `formatGaDate` (612–615) and add near the other local imports:

```ts
import { formatGaDate, formatMetric, percentChange } from "./analytics-format";
```

Run: `npx vitest run src/features/analytics/AnalyticsDashboard.test.tsx`
Expected: PASS — behaviour is unchanged; only the definitions moved.

- [ ] **Step 12: Write the failing filters and quota tests**

Create `src/features/analytics/analytics-filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_DIMENSION,
  ANALYTICS_PLATFORMS,
  EMPTY_FILTERS,
  activeFilterCount,
  availablePlatforms,
  buildDimensionFilter,
  filtersKey,
  normalizePlatform,
  togglePlatform,
} from "./analytics-filters";

describe("filter identity", () => {
  it("keys the same selection identically regardless of click order", () => {
    const a = { platforms: ["Android", "iOS"] as const, accountType: "all" as const };
    const b = { platforms: ["iOS", "Android"] as const, accountType: "all" as const };

    expect(filtersKey(a)).toBe(filtersKey(b));
    expect(filtersKey(EMPTY_FILTERS)).toBe("|all");
    expect(filtersKey({ platforms: ["web"], accountType: "business" })).toBe(
      "web|business",
    );
  });

  it("counts each active constraint once", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ platforms: ["iOS"], accountType: "all" })).toBe(1);
    expect(
      activeFilterCount({ platforms: ["iOS", "web"], accountType: "business" }),
    ).toBe(3);
  });

  it("toggles a platform without disturbing the canonical order", () => {
    const withWeb = togglePlatform(EMPTY_FILTERS, "web");
    const withBoth = togglePlatform(withWeb, "iOS");

    expect(withBoth.platforms).toEqual(["iOS", "web"]);
    expect(togglePlatform(withBoth, "web").platforms).toEqual(["iOS"]);
  });
});

describe("buildDimensionFilter", () => {
  it("sends nothing when nothing is selected", () => {
    expect(buildDimensionFilter(EMPTY_FILTERS)).toBeUndefined();
  });

  it("sends a bare filter for one constraint and an andGroup for two", () => {
    expect(
      buildDimensionFilter({ platforms: ["iOS", "Android"], accountType: "all" }),
    ).toEqual({
      filter: {
        fieldName: "platform",
        inListFilter: { values: ["iOS", "Android"] },
      },
    });

    expect(
      buildDimensionFilter({ platforms: [], accountType: "business" }),
    ).toEqual({
      filter: {
        fieldName: ACCOUNT_TYPE_DIMENSION,
        stringFilter: { matchType: "EXACT", value: "business" },
      },
    });

    expect(
      buildDimensionFilter({ platforms: ["web"], accountType: "consumer" }),
    ).toEqual({
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "platform",
              inListFilter: { values: ["web"] },
            },
          },
          {
            filter: {
              fieldName: ACCOUNT_TYPE_DIMENSION,
              stringFilter: { matchType: "EXACT", value: "consumer" },
            },
          },
        ],
      },
    });
  });

  it("omits caseSensitive so an unexpected platform casing still matches", () => {
    const expression = buildDimensionFilter({
      platforms: ["web"],
      accountType: "all",
    });

    expect(JSON.stringify(expression)).not.toContain("caseSensitive");
  });
});

describe("availablePlatforms", () => {
  it("offers the chips only where more than one platform can appear", () => {
    expect(availablePlatforms("mixed")).toEqual(ANALYTICS_PLATFORMS);
    expect(availablePlatforms("web")).toEqual([]);
    expect(availablePlatforms("ios")).toEqual([]);
    expect(availablePlatforms("android")).toEqual([]);
  });
});

describe("normalizePlatform", () => {
  it("maps GA4's casing onto the canonical labels and passes anything else through", () => {
    expect(normalizePlatform("ios")).toBe("iOS");
    expect(normalizePlatform("ANDROID")).toBe("Android");
    expect(normalizePlatform("Web")).toBe("web");
    expect(normalizePlatform("(not set)")).toBe("(not set)");
  });
});
```

Create `src/features/analytics/analytics-quota.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { QUOTA_POOL_LABELS, quotaPressure } from "./analytics-quota";
import type { AnalyticsQuotaState } from "./types";

function quota(
  entries: AnalyticsQuotaState["entries"],
  category: AnalyticsQuotaState["category"] = "core",
): AnalyticsQuotaState {
  return { category, entries };
}

describe("quotaPressure", () => {
  it("is ok when nothing is known or plenty remains", () => {
    expect(quotaPressure(null)).toEqual({
      level: "ok",
      scope: null,
      key: null,
      ratio: null,
    });
    expect(
      quotaPressure(
        quota([{ key: "tokensPerHour", consumed: 100, remaining: 39_900 }]),
      ).level,
    ).toBe("ok");
  });

  it("warns below a tenth of the hourly or daily pool", () => {
    expect(
      quotaPressure(
        quota([{ key: "tokensPerHour", consumed: 39_000, remaining: 1_000 }]),
      ),
    ).toEqual({ level: "low", scope: "hour", key: "tokensPerHour", ratio: 0.025 });

    expect(
      quotaPressure(
        quota([{ key: "tokensPerDay", consumed: 195_000, remaining: 5_000 }]),
      ).scope,
    ).toBe("day");
  });

  it("reports exhaustion and prefers the hourly pool when both are spent", () => {
    expect(
      quotaPressure(
        quota([
          { key: "tokensPerDay", consumed: 200_000, remaining: 0 },
          { key: "tokensPerHour", consumed: 40_000, remaining: 0 },
        ]),
      ),
    ).toEqual({ level: "exhausted", scope: "hour", key: "tokensPerHour", ratio: 0 });
  });

  it("ignores pools that are not token budgets", () => {
    expect(
      quotaPressure(
        quota([{ key: "concurrentRequests", consumed: 10, remaining: 0 }]),
      ).level,
    ).toBe("ok");
  });

  it("names each pool for the footer", () => {
    expect(QUOTA_POOL_LABELS).toEqual({
      core: "Core",
      realtime: "실시간",
      funnel: "퍼널(별도 풀)",
    });
  });
});
```

- [ ] **Step 13: Run them, watch them fail, create both modules, make them pass, commit 2A**

Run: `npx vitest run src/features/analytics/analytics-filters.test.ts src/features/analytics/analytics-quota.test.ts`
Expected: FAIL — neither module exists.

Create `src/features/analytics/analytics-filters.ts`:

```ts
import type { AnalyticsFilterExpression } from "./analytics-data-api";
import type { AnalyticsPropertyPlatform } from "./types";

/**
 * The two questions an operator asks of every report: which platform, and
 * consumer or business.
 *
 * Platform is a GA4 built-in dimension. Account type is not — it needs a
 * user-scoped custom dimension registered from the app's `account_type` user
 * property, so the UI asks the property what it has before offering it
 * (`fetchAnalyticsCapabilities`).
 */

export const ANALYTICS_PLATFORMS = ["iOS", "Android", "web"] as const;

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

export type AnalyticsAccountType = "all" | "consumer" | "business";

export type AnalyticsFilters = {
  platforms: readonly AnalyticsPlatform[];
  accountType: AnalyticsAccountType;
};

export const ACCOUNT_TYPE_DIMENSION = "customUser:account_type";

export const PLATFORM_DIMENSION = "platform";

export const EMPTY_FILTERS: AnalyticsFilters = {
  platforms: [],
  accountType: "all",
};

function canonicalPlatforms(
  platforms: readonly AnalyticsPlatform[],
): AnalyticsPlatform[] {
  return ANALYTICS_PLATFORMS.filter((platform) => platforms.includes(platform));
}

/**
 * Stable identity for the React Query key. Two selections that request the
 * same data must produce the same string, or clicking a chip off and on again
 * refetches what is already cached.
 */
export function filtersKey(filters: AnalyticsFilters): string {
  return `${canonicalPlatforms(filters.platforms).join(",")}|${filters.accountType}`;
}

export function activeFilterCount(filters: AnalyticsFilters): number {
  return filters.platforms.length + (filters.accountType === "all" ? 0 : 1);
}

export function togglePlatform(
  filters: AnalyticsFilters,
  platform: AnalyticsPlatform,
): AnalyticsFilters {
  const next = filters.platforms.includes(platform)
    ? filters.platforms.filter((value) => value !== platform)
    : [...filters.platforms, platform];
  return { ...filters, platforms: canonicalPlatforms(next) };
}

export function buildDimensionFilter(
  filters: AnalyticsFilters,
): AnalyticsFilterExpression | undefined {
  const expressions: AnalyticsFilterExpression[] = [];
  const platforms = canonicalPlatforms(filters.platforms);

  if (platforms.length > 0) {
    // `caseSensitive` is deliberately omitted (GA4 defaults it to false). The
    // published docs quote "iOS" and "Android" from a real response but only
    // describe the web value in prose, so an exact-case list could silently
    // match nothing.
    expressions.push({
      filter: {
        fieldName: PLATFORM_DIMENSION,
        inListFilter: { values: platforms },
      },
    });
  }
  if (filters.accountType !== "all") {
    expressions.push({
      filter: {
        fieldName: ACCOUNT_TYPE_DIMENSION,
        stringFilter: { matchType: "EXACT", value: filters.accountType },
      },
    });
  }

  if (expressions.length === 0) return undefined;
  if (expressions.length === 1) return expressions[0];
  return { andGroup: { expressions } };
}

/**
 * A single-platform property has exactly one platform value, so a platform
 * chip there can only ever filter everything or nothing. Only a `mixed`
 * property gets the chips.
 */
export function availablePlatforms(
  platform: AnalyticsPropertyPlatform,
): readonly AnalyticsPlatform[] {
  return platform === "mixed" ? ANALYTICS_PLATFORMS : [];
}

const PLATFORM_ALIASES: Record<string, AnalyticsPlatform> = {
  ios: "iOS",
  android: "Android",
  web: "web",
};

/** GA4's exact casing for the web value is not documented; fold it here once. */
export function normalizePlatform(value: string): string {
  return PLATFORM_ALIASES[value.trim().toLowerCase()] ?? value;
}
```

Create `src/features/analytics/analytics-quota.ts`:

```ts
import type { AnalyticsQuotaCategory, AnalyticsQuotaState } from "./types";

/**
 * GA4 bills Core, Realtime and Funnel from separate token pools. Naming the
 * pool matters: "할당량 소진" on the funnel tab does not mean the tables are
 * unavailable, and an operator who assumes it does stops investigating.
 */
export const QUOTA_POOL_LABELS: Record<AnalyticsQuotaCategory, string> = {
  core: "Core",
  realtime: "실시간",
  funnel: "퍼널(별도 풀)",
};

export const QUOTA_LOW_RATIO = 0.1;

const HOUR_KEYS = ["tokensPerHour", "tokensPerProjectPerHour"] as const;
const DAY_KEYS = ["tokensPerDay"] as const;

export type AnalyticsQuotaPressure = {
  level: "ok" | "low" | "exhausted";
  scope: "hour" | "day" | null;
  key: string | null;
  ratio: number | null;
};

const OK: AnalyticsQuotaPressure = {
  level: "ok",
  scope: null,
  key: null,
  ratio: null,
};

export function quotaPressure(
  quota: AnalyticsQuotaState | null,
): AnalyticsQuotaPressure {
  if (!quota) return OK;

  let worst: AnalyticsQuotaPressure = OK;
  for (const entry of quota.entries) {
    const scope = (HOUR_KEYS as readonly string[]).includes(entry.key)
      ? ("hour" as const)
      : (DAY_KEYS as readonly string[]).includes(entry.key)
        ? ("day" as const)
        : null;
    if (scope === null) continue;

    const total = entry.consumed + entry.remaining;
    if (total <= 0) continue;
    const ratio = entry.remaining / total;
    const level =
      entry.remaining === 0
        ? ("exhausted" as const)
        : ratio < QUOTA_LOW_RATIO
          ? ("low" as const)
          : ("ok" as const);
    if (level === "ok") continue;

    const candidate: AnalyticsQuotaPressure = { level, scope, key: entry.key, ratio };
    // Exhausted beats low; at the same level the hourly pool is the one an
    // operator can wait out, so name it first.
    if (
      worst.level === "ok" ||
      (worst.level === "low" && level === "exhausted") ||
      (worst.level === level && scope === "hour" && worst.scope !== "hour")
    ) {
      worst = candidate;
    }
  }
  return worst;
}
```

Run: `npx vitest run src/features/analytics/analytics-filters.test.ts src/features/analytics/analytics-quota.test.ts`
Expected: PASS

Then run the whole suite once before committing: `npx vitest run src/features/analytics`
Expected: PASS

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics
git rev-parse --abbrev-ref HEAD   # must print feat/analytics-analysis
git add src/features/analytics/types.ts src/features/analytics/analytics-labels.ts \
  src/features/analytics/analytics-report-shaping.ts src/features/analytics/analytics-report-shaping.test.ts \
  src/features/analytics/analytics-format.ts src/features/analytics/analytics-format.test.ts \
  src/features/analytics/analytics-filters.ts src/features/analytics/analytics-filters.test.ts \
  src/features/analytics/analytics-quota.ts src/features/analytics/analytics-quota.test.ts \
  src/features/analytics/analytics-reports.ts src/features/analytics/user-behavior-report.ts \
  src/features/analytics/AnalyticsDashboard.tsx
git commit -m "$(cat <<'MSG'
refactor(analytics): extract shared report shaping, formatting, filters and quota

The funnel and retention modules need the same numeric parsing, row flattening,
quota merge and relative date windows the report composer had inlined, and they
cannot import the composer without a cycle. Those helpers move to
analytics-report-shaping, the dashboard's number formatting moves to
analytics-format, and user-behavior-report drops its private copy of the quota
merge and notice dedupe.

New: analytics-filters (platform + account-type selection, one canonical query
key, GA4 dimension filter) and analytics-quota (Core/Realtime/Funnel pool
labels and a pressure reading). Quota state now carries the pool it came from.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

#### 2B — the four analysis modules

- [ ] **Step 14: Write the failing funnel-definition test**

Create `src/features/analytics/funnel-definitions.test.ts`:

```ts
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
```

- [ ] **Step 15: Run it, watch it fail, then write `funnel-definitions.ts`**

Run: `npx vitest run src/features/analytics/funnel-definitions.test.ts`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/funnel-definitions.ts`:

```ts
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
```

- [ ] **Step 16: Run it and make it pass**

Run: `npx vitest run src/features/analytics/funnel-definitions.test.ts`
Expected: PASS

- [ ] **Step 17: Write the failing funnel-shaping test**

Create `src/features/analytics/analytics-funnel.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return { ...actual, runAnalyticsFunnelReport: vi.fn() };
});

import {
  AnalyticsDataApiError,
  runAnalyticsFunnelReport,
  type AnalyticsFunnelSubReport,
} from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import { FUNNEL_DEFINITIONS } from "./funnel-definitions";
import { fetchFunnel, shapeFunnel } from "./analytics-funnel";

const property = { id: "5678", label: "Dopa App", platform: "mixed" as const };

const FUNNEL_HEADERS = [
  { name: "activeUsers" },
  { name: "funnelStepCompletionRate" },
  { name: "funnelStepAbandonments" },
  { name: "funnelStepAbandonmentRate" },
];

function table(
  rows: Array<{ dimensions: string[]; metrics: string[] }>,
  breakdown = false,
  metadata?: AnalyticsFunnelSubReport["metadata"],
): AnalyticsFunnelSubReport {
  return {
    dimensionHeaders: breakdown
      ? [{ name: "funnelStepName" }, { name: "platform" }]
      : [{ name: "funnelStepName" }],
    metricHeaders: FUNNEL_HEADERS,
    rows: rows.map((row) => ({
      dimensionValues: row.dimensions.map((value) => ({ value })),
      metricValues: row.metrics.map((value) => ({ value })),
    })),
    ...(metadata ? { metadata } : {}),
  };
}

describe("shapeFunnel", () => {
  it("reads the API's ordinal prefix and leaves the last step's rates null", () => {
    const { steps, breakdown } = shapeFunnel(
      table([
        { dimensions: ["1. 파티 상세"], metrics: ["1000", "0.4", "600", "0.6"] },
        { dimensions: ["2. 신청 화면"], metrics: ["400", "0.25", "300", "0.75"] },
        { dimensions: ["3. 신청 완료"], metrics: ["100", "0", "0", "0"] },
      ]),
      FUNNEL_DEFINITIONS["party-apply"],
      false,
    );

    expect(breakdown).toBeNull();
    expect(steps).toEqual([
      {
        index: 0,
        name: "파티 상세",
        users: 1000,
        completionRate: 0.4,
        abandonments: 600,
        abandonmentRate: 0.6,
        shareOfFirst: 1,
      },
      {
        index: 1,
        name: "신청 화면",
        users: 400,
        completionRate: 0.25,
        abandonments: 300,
        abandonmentRate: 0.75,
        shareOfFirst: 0.4,
      },
      {
        index: 2,
        name: "신청 완료",
        users: 100,
        completionRate: null,
        abandonments: null,
        abandonmentRate: null,
        shareOfFirst: 0.1,
      },
    ]);
  });

  it("falls back to appearance order when GA4 sends no ordinal prefix", () => {
    const { steps } = shapeFunnel(
      table([
        { dimensions: ["파티 상세"], metrics: ["10", "0.5", "5", "0.5"] },
        { dimensions: ["신청 화면"], metrics: ["5", "0.4", "3", "0.6"] },
        { dimensions: ["신청 완료"], metrics: ["2", "0", "0", "0"] },
      ]),
      FUNNEL_DEFINITIONS["party-apply"],
      false,
    );

    expect(steps.map(({ users }) => users)).toEqual([10, 5, 2]);
  });

  it("treats RESERVED_TOTAL as the funnel and groups the rest by platform", () => {
    const { steps, breakdown } = shapeFunnel(
      table(
        [
          {
            dimensions: ["1. 파티 상세", "RESERVED_TOTAL"],
            metrics: ["1000", "0.4", "600", "0.6"],
          },
          { dimensions: ["1. 파티 상세", "iOS"], metrics: ["600", "0.5", "300", "0.5"] },
          {
            dimensions: ["1. 파티 상세", "Android"],
            metrics: ["400", "0.25", "300", "0.75"],
          },
          {
            dimensions: ["2. 신청 화면", "RESERVED_TOTAL"],
            metrics: ["400", "0.25", "300", "0.75"],
          },
          { dimensions: ["2. 신청 화면", "iOS"], metrics: ["300", "0.3", "210", "0.7"] },
          {
            dimensions: ["2. 신청 화면", "Android"],
            metrics: ["100", "0.1", "90", "0.9"],
          },
          {
            dimensions: ["3. 신청 완료", "RESERVED_TOTAL"],
            metrics: ["100", "0", "0", "0"],
          },
          { dimensions: ["3. 신청 완료", "iOS"], metrics: ["90", "0", "0", "0"] },
          { dimensions: ["3. 신청 완료", "Android"], metrics: ["10", "0", "0", "0"] },
        ],
        true,
      ),
      FUNNEL_DEFINITIONS["party-apply"],
      true,
    );

    expect(steps.map(({ users }) => users)).toEqual([1000, 400, 100]);
    expect(breakdown?.dimension).toBe("platform");
    expect(breakdown?.rows.map(({ value }) => value)).toEqual(["iOS", "Android"]);
    expect(breakdown?.rows[0]?.steps.map(({ users }) => users)).toEqual([600, 300, 90]);
    expect(breakdown?.rows[1]?.steps[2]?.shareOfFirst).toBeCloseTo(0.025);
  });

  it("refuses a non-numeric funnel metric rather than showing it as zero", () => {
    expect(() =>
      shapeFunnel(
        table([
          { dimensions: ["1. 파티 상세"], metrics: ["nope", "0", "0", "0"] },
        ]),
        FUNNEL_DEFINITIONS["party-apply"],
        false,
      ),
    ).toThrow(AnalyticsDataApiError);
  });
});

describe("fetchFunnel", () => {
  beforeEach(() => {
    vi.mocked(runAnalyticsFunnelReport).mockReset();
  });

  it("requests one funnel, tags the funnel quota pool and carries sampling notices", async () => {
    vi.mocked(runAnalyticsFunnelReport).mockResolvedValue({
      funnelTable: table(
        [
          { dimensions: ["1. 결제 화면"], metrics: ["50", "0.5", "25", "0.5"] },
          { dimensions: ["2. 결제 의도"], metrics: ["25", "0.4", "15", "0.6"] },
          { dimensions: ["3. 결제 승인"], metrics: ["10", "0", "0", "0"] },
        ],
        false,
        {
          samplingMetadatas: [
            { samplesReadCount: "1000", samplingSpaceSize: "4000" },
          ],
        },
      ),
      propertyQuota: { tokensPerHour: { consumed: 12, remaining: 39_988 } },
    });

    const result = await fetchFunnel({
      property,
      range: "28d",
      filters: EMPTY_FILTERS,
      funnelId: "party-payment",
      breakdown: false,
      accessToken: "memory-token",
    });

    expect(runAnalyticsFunnelReport).toHaveBeenCalledTimes(1);
    expect(runAnalyticsFunnelReport).toHaveBeenCalledWith(
      "5678",
      expect.objectContaining({
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      }),
      expect.objectContaining({ accessToken: "memory-token" }),
    );
    expect(result.view).toBe("funnel");
    expect(result.funnelId).toBe("party-payment");
    expect(result.title).toBe("결제");
    expect(result.quota?.category).toBe("funnel");
    expect(result.dataQualityNotices).toEqual([
      {
        kind: "sampling",
        reportKey: "funnel:party-payment",
        reportTitle: "결제",
        samplesReadCount: "1000",
        samplingSpaceSize: "4000",
      },
    ]);
    expect(result.isEmpty).toBe(false);
  });

  it("is empty only when every step has no users, and survives a missing quota", async () => {
    vi.mocked(runAnalyticsFunnelReport).mockResolvedValue({
      funnelTable: table([
        { dimensions: ["1. 파티 상세"], metrics: ["0", "0", "0", "0"] },
        { dimensions: ["2. 신청 화면"], metrics: ["0", "0", "0", "0"] },
        { dimensions: ["3. 신청 완료"], metrics: ["0", "0", "0", "0"] },
      ]),
    });

    const result = await fetchFunnel({
      property,
      range: "7d",
      filters: EMPTY_FILTERS,
      funnelId: "party-apply",
      breakdown: false,
      accessToken: "memory-token",
    });

    expect(result.isEmpty).toBe(true);
    expect(result.quota).toBeNull();
    expect(result.steps).toHaveLength(3);
  });
});
```

- [ ] **Step 18: Run it, watch it fail, then write `analytics-funnel.ts`**

Run: `npx vitest run src/features/analytics/analytics-funnel.test.ts`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/analytics-funnel.ts`:

```ts
import {
  AnalyticsDataApiError,
  runAnalyticsFunnelReport,
  type AnalyticsDataApiOptions,
  type AnalyticsFunnelSubReport,
} from "./analytics-data-api";
import { normalizePlatform, type AnalyticsFilters } from "./analytics-filters";
import {
  dataQualityNoticesForReport,
  numericValue,
  quotaFromReports,
} from "./analytics-report-shaping";
import {
  FUNNEL_DEFINITIONS,
  buildFunnelRequest,
  type FunnelDefinition,
  type FunnelId,
} from "./funnel-definitions";
import type {
  AnalyticsDateRange,
  AnalyticsFunnelResult,
  AnalyticsFunnelStepResult,
  AnalyticsPropertyConfig,
} from "./types";

/** GA4 marks the un-broken-down totals with this reserved breakdown value. */
export const FUNNEL_TOTAL_VALUE = "RESERVED_TOTAL";

/** GA4 prefixes each step label with its 1-based position: "1. 파티 상세". */
const STEP_PREFIX = /^(\d+)\.\s*/;

type StepMetrics = {
  users: number;
  completionRate: number;
  abandonments: number;
  abandonmentRate: number;
};

function metricIndexes(table: AnalyticsFunnelSubReport) {
  const index = (name: string) =>
    table.metricHeaders.findIndex((header) => header.name === name);
  return {
    users: index("activeUsers"),
    completionRate: index("funnelStepCompletionRate"),
    abandonments: index("funnelStepAbandonments"),
    abandonmentRate: index("funnelStepAbandonmentRate"),
  };
}

/**
 * The two rate metrics arrive typed `TYPE_INTEGER` while holding fractions
 * ("0.412" is 41.2 %). Parsing them as floats regardless is the whole point of
 * not reading `metricHeaders[].type`.
 */
function readStepMetrics(
  values: readonly { value: string }[],
  indexes: ReturnType<typeof metricIndexes>,
): StepMetrics {
  return {
    users: numericValue(values[indexes.users]?.value),
    completionRate: numericValue(values[indexes.completionRate]?.value),
    abandonments: numericValue(values[indexes.abandonments]?.value),
    abandonmentRate: numericValue(values[indexes.abandonmentRate]?.value),
  };
}

function stepIndexOf(label: string, appearance: Map<string, number>): number {
  const match = STEP_PREFIX.exec(label);
  if (match) {
    const parsed = Number(match[1]) - 1;
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  const existing = appearance.get(label);
  if (existing !== undefined) return existing;
  const next = appearance.size;
  appearance.set(label, next);
  return next;
}

function buildSteps(
  byIndex: Map<number, StepMetrics>,
  definition: FunnelDefinition,
): AnalyticsFunnelStepResult[] {
  const firstUsers = byIndex.get(0)?.users ?? 0;
  const lastIndex = definition.steps.length - 1;
  return definition.steps.map((step, index) => {
    const metrics = byIndex.get(index);
    const users = metrics?.users ?? 0;
    // The last step has no next step, so GA4's completion and abandonment
    // figures there describe nothing. Showing "0%" would read as total loss.
    const isLast = index === lastIndex;
    return {
      index,
      name: step.name,
      users,
      completionRate: isLast ? null : (metrics?.completionRate ?? null),
      abandonments: isLast ? null : (metrics?.abandonments ?? null),
      abandonmentRate: isLast ? null : (metrics?.abandonmentRate ?? null),
      shareOfFirst: firstUsers > 0 ? users / firstUsers : 0,
    };
  });
}

export function shapeFunnel(
  table: AnalyticsFunnelSubReport,
  definition: FunnelDefinition,
  breakdown: boolean,
): {
  steps: AnalyticsFunnelStepResult[];
  breakdown: AnalyticsFunnelResult["breakdown"];
} {
  const indexes = metricIndexes(table);
  const appearance = new Map<string, number>();
  const totals = new Map<number, StepMetrics>();
  const grouped = new Map<string, Map<number, StepMetrics>>();

  for (const row of table.rows) {
    const label = row.dimensionValues[0]?.value ?? "";
    const stepIndex = stepIndexOf(label, appearance);
    const metrics = readStepMetrics(row.metricValues, indexes);

    if (!breakdown) {
      totals.set(stepIndex, metrics);
      continue;
    }
    const breakdownValue = row.dimensionValues[1]?.value ?? "";
    if (breakdownValue === FUNNEL_TOTAL_VALUE) {
      totals.set(stepIndex, metrics);
      continue;
    }
    const value = normalizePlatform(breakdownValue);
    const bucket = grouped.get(value) ?? new Map<number, StepMetrics>();
    bucket.set(stepIndex, metrics);
    grouped.set(value, bucket);
  }

  const steps = buildSteps(totals, definition);
  if (!breakdown) return { steps, breakdown: null };

  const rows = Array.from(grouped, ([value, byIndex]) => ({
    value,
    steps: buildSteps(byIndex, definition),
  })).sort(
    (a, b) =>
      (b.steps[0]?.users ?? 0) - (a.steps[0]?.users ?? 0) ||
      a.value.localeCompare(b.value),
  );
  return { steps, breakdown: { dimension: "platform", rows } };
}

export type FetchFunnelInput = {
  property: AnalyticsPropertyConfig;
  range: AnalyticsDateRange;
  filters: AnalyticsFilters;
  funnelId: FunnelId;
  breakdown: boolean;
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: AnalyticsDataApiOptions["fetchImpl"];
};

export async function fetchFunnel(
  input: FetchFunnelInput,
): Promise<AnalyticsFunnelResult> {
  const definition = FUNNEL_DEFINITIONS[input.funnelId];
  const response = await runAnalyticsFunnelReport(
    input.property.id,
    buildFunnelRequest(definition, input.range, input.filters, input.breakdown),
    {
      accessToken: input.accessToken,
      signal: input.signal,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    },
  );

  const table = response.funnelTable;
  if (!table) {
    // `assertFunnelContract` already rejected this; the guard narrows the type.
    throw new AnalyticsDataApiError(
      "invalid-response",
      "Google Analytics 퍼널 응답에 결과 표가 없습니다.",
    );
  }

  const { steps, breakdown } = shapeFunnel(table, definition, input.breakdown);
  return {
    view: "funnel",
    funnelId: definition.id,
    title: definition.title,
    description: definition.description,
    steps,
    breakdown,
    // A funnel reports people, never money; the union carries the field so the
    // dashboard can format any result the same way.
    currencyCode: "KRW",
    quota: quotaFromReports([response], "funnel"),
    dataQualityNotices: dataQualityNoticesForReport(table.metadata, {
      key: `funnel:${definition.id}`,
      title: definition.title,
    }),
    isEmpty: steps.every((step) => step.users === 0),
  };
}
```

- [ ] **Step 19: Run it and make it pass**

Run: `npx vitest run src/features/analytics/analytics-funnel.test.ts`
Expected: PASS

- [ ] **Step 20: Write the failing retention test**

Create `src/features/analytics/analytics-retention.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return { ...actual, runAnalyticsReport: vi.fn() };
});

import { runAnalyticsReport, type AnalyticsReportResponse } from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import {
  RETENTION_HORIZON,
  buildRetentionRequest,
  buildWeeklyCohorts,
  fetchRetention,
  retentionYesterday,
  shapeRetention,
} from "./analytics-retention";

const property = { id: "5678", label: "Dopa App", platform: "mixed" as const };

/**
 * Built from local calendar components on purpose. The suite pins no TZ, and
 * `buildWeeklyCohorts` reads local Y/M/D, so an offset string like
 * "2026-09-08T03:00:00+09:00" would be a different calendar day outside KST.
 */
const NOW = new Date(2026, 8, 8, 12, 0, 0);

function retentionReport(
  rows: Array<{ cohort: string; week: string; active: string; total: string }>,
): AnalyticsReportResponse {
  return {
    dimensionHeaders: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metricHeaders: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
    rows: rows.map((row) => ({
      dimensionValues: [{ value: row.cohort }, { value: row.week }],
      metricValues: [{ value: row.active }, { value: row.total }],
    })),
    totals: [],
    rowCount: rows.length,
    metadata: { currencyCode: "KRW", timeZone: "Asia/Seoul" },
  };
}

describe("buildWeeklyCohorts", () => {
  it("takes the six complete Sunday–Saturday weeks ending on or before yesterday", () => {
    expect(buildWeeklyCohorts(NOW)).toEqual([
      { name: "2026-07-26", startDate: "2026-07-26", endDate: "2026-08-01" },
      { name: "2026-08-02", startDate: "2026-08-02", endDate: "2026-08-08" },
      { name: "2026-08-09", startDate: "2026-08-09", endDate: "2026-08-15" },
      { name: "2026-08-16", startDate: "2026-08-16", endDate: "2026-08-22" },
      { name: "2026-08-23", startDate: "2026-08-23", endDate: "2026-08-29" },
      { name: "2026-08-30", startDate: "2026-08-30", endDate: "2026-09-05" },
    ]);
    expect(retentionYesterday(NOW)).toBe("2026-09-07");
  });

  it("never includes the week that is still running", () => {
    // A Sunday: yesterday is the Saturday that just closed a week.
    const sunday = new Date(2026, 8, 6, 9, 0, 0);
    expect(buildWeeklyCohorts(sunday, 1)).toEqual([
      { name: "2026-08-30", startDate: "2026-08-30", endDate: "2026-09-05" },
    ]);
    // A Saturday: yesterday is Friday, so that week is incomplete.
    const saturday = new Date(2026, 8, 5, 9, 0, 0);
    expect(buildWeeklyCohorts(saturday, 1)).toEqual([
      { name: "2026-08-23", startDate: "2026-08-23", endDate: "2026-08-29" },
    ]);
  });
});

describe("buildRetentionRequest", () => {
  it("sends a cohortSpec and no top-level date range", () => {
    const request = buildRetentionRequest(buildWeeklyCohorts(NOW));

    expect(request.dateRanges).toBeUndefined();
    expect(request.dimensions).toEqual([
      { name: "cohort" },
      { name: "cohortNthWeek" },
    ]);
    expect(request.metrics).toEqual([
      { name: "cohortActiveUsers" },
      { name: "cohortTotalUsers" },
    ]);
    expect(request.cohortSpec?.cohortsRange).toEqual({
      granularity: "WEEKLY",
      startOffset: 0,
      endOffset: RETENTION_HORIZON,
    });
    expect(request.cohortSpec?.cohorts[0]).toEqual({
      name: "2026-07-26",
      dimension: "firstSessionDate",
      dateRange: { startDate: "2026-07-26", endDate: "2026-08-01" },
    });
    expect(request.cohortSpec?.cohorts).toHaveLength(6);
    expect(request.limit).toBe(100);
    expect(request.returnPropertyQuota).toBe(true);
    expect(request.dimensionFilter).toBeUndefined();
  });

  it("threads a dimension filter through unchanged", () => {
    const filter = {
      filter: {
        fieldName: "platform",
        inListFilter: { values: ["iOS"] },
      },
    } as const;

    expect(
      buildRetentionRequest(buildWeeklyCohorts(NOW), filter).dimensionFilter,
    ).toEqual(filter);
  });
});

describe("shapeRetention", () => {
  const cohorts = buildWeeklyCohorts(NOW);

  it("indexes unordered, zero-padded weeks and marks unfinished ones", () => {
    const shaped = shapeRetention(
      retentionReport([
        { cohort: "2026-08-30", week: "0001", active: "30", total: "120" },
        { cohort: "2026-08-30", week: "0000", active: "120", total: "120" },
        { cohort: "2026-07-26", week: "0000", active: "80", total: "80" },
        { cohort: "2026-07-26", week: "0004", active: "20", total: "80" },
      ]),
      cohorts,
      "2026-09-07",
    );

    const latest = shaped.at(-1);
    expect(latest?.name).toBe("2026-08-30");
    expect(latest?.totalUsers).toBe(120);
    expect(latest?.cells).toEqual([
      { week: 0, activeUsers: 120, rate: 1, state: "complete" },
      { week: 1, activeUsers: 30, rate: 0.25, state: "partial" },
      { week: 2, activeUsers: 0, rate: 0, state: "future" },
      { week: 3, activeUsers: 0, rate: 0, state: "future" },
      { week: 4, activeUsers: 0, rate: 0, state: "future" },
    ]);

    const oldest = shaped[0];
    expect(oldest?.cells.map(({ state }) => state)).toEqual([
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
    expect(oldest?.cells[4]).toMatchObject({ activeUsers: 20, rate: 0.25 });
  });

  it("leaves an empty cohort's rate null instead of drawing it as 0%", () => {
    const shaped = shapeRetention(retentionReport([]), cohorts, "2026-09-07");

    expect(shaped).toHaveLength(6);
    expect(shaped[0]?.totalUsers).toBe(0);
    expect(shaped[0]?.cells[0]?.rate).toBeNull();
  });

  it("accepts GA4's positional cohort names", () => {
    const shaped = shapeRetention(
      retentionReport([
        { cohort: "cohort_5", week: "0000", active: "10", total: "10" },
      ]),
      cohorts,
      "2026-09-07",
    );

    expect(shaped.at(-1)?.totalUsers).toBe(10);
  });
});

describe("fetchRetention", () => {
  beforeEach(() => {
    vi.mocked(runAnalyticsReport).mockReset();
  });

  it("issues exactly one core report and reports emptiness honestly", async () => {
    vi.mocked(runAnalyticsReport).mockResolvedValue({
      ...retentionReport([
        { cohort: "2026-08-30", week: "0000", active: "120", total: "120" },
      ]),
      propertyQuota: { tokensPerDay: { consumed: 40, remaining: 199_960 } },
    });

    const result = await fetchRetention({
      property,
      filters: EMPTY_FILTERS,
      accessToken: "memory-token",
      now: NOW,
    });

    expect(runAnalyticsReport).toHaveBeenCalledTimes(1);
    expect(result.view).toBe("retention");
    expect(result.granularity).toBe("WEEKLY");
    expect(result.horizon).toBe(4);
    expect(result.cohorts).toHaveLength(6);
    expect(result.quota?.category).toBe("core");
    expect(result.isEmpty).toBe(false);

    vi.mocked(runAnalyticsReport).mockResolvedValue(retentionReport([]));
    const empty = await fetchRetention({
      property,
      filters: EMPTY_FILTERS,
      accessToken: "memory-token",
      now: NOW,
    });
    expect(empty.isEmpty).toBe(true);
  });
});
```

- [ ] **Step 21: Run it, watch it fail, then write `analytics-retention.ts`**

Run: `npx vitest run src/features/analytics/analytics-retention.test.ts`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/analytics-retention.ts`:

```ts
import {
  runAnalyticsReport,
  type AnalyticsDataApiOptions,
  type AnalyticsFilterExpression,
  type AnalyticsReportResponse,
  type AnalyticsRunReportRequest,
} from "./analytics-data-api";
import { buildDimensionFilter, type AnalyticsFilters } from "./analytics-filters";
import {
  currencyFromReports,
  dataQualityNoticesForReport,
  numericValue,
  quotaFromReports,
  reportRows,
} from "./analytics-report-shaping";
import type {
  AnalyticsPropertyConfig,
  AnalyticsRetentionCohort,
  AnalyticsRetentionResult,
} from "./types";

/**
 * Weekly retention by first-session week.
 *
 * Fixed at six cohorts and four follow-up weeks: 6 × 5 = 30 rows, one Core
 * request, and a matrix that still fits a laptop screen. The date selector is
 * disabled for this view because the cohorts define their own window.
 */

export const RETENTION_COHORT_COUNT = 6;
export const RETENTION_HORIZON = 4;

const DAY_MS = 86_400_000;

const RETENTION_SCOPE = { key: "retention", title: "주간 코호트 리텐션" };

export type RetentionCohortRange = {
  name: string;
  startDate: string;
  endDate: string;
};

function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * The operator's calendar day, read from local Y/M/D and then carried in UTC
 * purely as a day counter. Reading UTC fields directly would put an operator
 * in Seoul on yesterday's date for nine hours every morning.
 */
function startOfLocalDayUtc(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function retentionYesterday(now: Date): string {
  return isoDay(startOfLocalDayUtc(now) - DAY_MS);
}

export function buildWeeklyCohorts(
  now: Date,
  weeks = RETENTION_COHORT_COUNT,
): RetentionCohortRange[] {
  const yesterday = startOfLocalDayUtc(now) - DAY_MS;
  // GA4 weeks run Sunday–Saturday. Walk back to the last Saturday that is on
  // or before yesterday, so the newest cohort is a week that actually finished.
  const weekday = new Date(yesterday).getUTCDay();
  const lastSaturday = yesterday - ((weekday + 1) % 7) * DAY_MS;
  const latestStart = lastSaturday - 6 * DAY_MS;

  return Array.from({ length: weeks }, (_unused, index) => {
    const start = latestStart - (weeks - 1 - index) * 7 * DAY_MS;
    return {
      name: isoDay(start),
      startDate: isoDay(start),
      endDate: isoDay(start + 6 * DAY_MS),
    };
  });
}

export function buildRetentionRequest(
  cohorts: readonly RetentionCohortRange[],
  dimensionFilter?: AnalyticsFilterExpression,
): AnalyticsRunReportRequest {
  return {
    // No `dateRanges`: GA4 rejects a request that carries both a cohortSpec and
    // a top-level date range.
    dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metrics: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
    cohortSpec: {
      cohorts: cohorts.map(({ name, startDate, endDate }) => ({
        name,
        dimension: "firstSessionDate" as const,
        dateRange: { startDate, endDate },
      })),
      cohortsRange: {
        granularity: "WEEKLY" as const,
        startOffset: 0,
        endOffset: RETENTION_HORIZON,
      },
    },
    ...(dimensionFilter ? { dimensionFilter } : {}),
    limit: 100,
    returnPropertyQuota: true,
  };
}

function resolveCohortName(
  value: string,
  cohorts: readonly RetentionCohortRange[],
): string | null {
  if (cohorts.some((cohort) => cohort.name === value)) return value;
  // GA4 names unnamed cohorts by position. Accepting that form keeps the whole
  // matrix from blanking if the response ever comes back positional.
  const positional = /^cohort_(\d+)$/.exec(value);
  if (positional) return cohorts[Number(positional[1])]?.name ?? null;
  return null;
}

type RetentionCell = { active: number; total: number };

export function shapeRetention(
  report: AnalyticsReportResponse,
  cohorts: readonly RetentionCohortRange[],
  yesterday: string,
): AnalyticsRetentionCohort[] {
  const byCohort = new Map<string, Map<number, RetentionCell>>();
  for (const cohort of cohorts) {
    byCohort.set(cohort.name, new Map<number, RetentionCell>());
  }

  // GA4 returns cohort rows unordered and pads the week index ("0000").
  for (const row of reportRows(report)) {
    const name = resolveCohortName(row.cohort ?? "", cohorts);
    const cells = name === null ? undefined : byCohort.get(name);
    if (!cells) continue;
    cells.set(numericValue(row.cohortNthWeek), {
      active: numericValue(row.cohortActiveUsers),
      total: numericValue(row.cohortTotalUsers),
    });
  }

  const yesterdayMs = Date.parse(`${yesterday}T00:00:00.000Z`);
  return cohorts.map((cohort) => {
    const cells =
      byCohort.get(cohort.name) ?? new Map<number, RetentionCell>();
    const totalUsers = Math.max(
      0,
      ...Array.from(cells.values(), (cell) => cell.total),
    );
    const startMs = Date.parse(`${cohort.startDate}T00:00:00.000Z`);

    return {
      name: cohort.name,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      totalUsers,
      cells: Array.from({ length: RETENTION_HORIZON + 1 }, (_unused, week) => {
        const cell = cells.get(week);
        const activeUsers = cell?.active ?? 0;
        const weekStart = startMs + week * 7 * DAY_MS;
        const weekEnd = weekStart + 6 * DAY_MS;
        return {
          week,
          activeUsers,
          rate: totalUsers > 0 ? activeUsers / totalUsers : null,
          state:
            weekEnd <= yesterdayMs
              ? ("complete" as const)
              : weekStart <= yesterdayMs
                ? ("partial" as const)
                : ("future" as const),
        };
      }),
    };
  });
}

export type FetchRetentionInput = {
  property: AnalyticsPropertyConfig;
  filters: AnalyticsFilters;
  accessToken: string;
  /** Injectable so the cohort window is testable without touching the clock. */
  now?: Date;
  signal?: AbortSignal;
  fetchImpl?: AnalyticsDataApiOptions["fetchImpl"];
};

export async function fetchRetention(
  input: FetchRetentionInput,
): Promise<AnalyticsRetentionResult> {
  const now = input.now ?? new Date();
  const cohorts = buildWeeklyCohorts(now);
  const response = await runAnalyticsReport(
    input.property.id,
    buildRetentionRequest(cohorts, buildDimensionFilter(input.filters)),
    {
      accessToken: input.accessToken,
      signal: input.signal,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    },
  );

  const shaped = shapeRetention(response, cohorts, retentionYesterday(now));
  return {
    view: "retention",
    granularity: "WEEKLY",
    horizon: RETENTION_HORIZON,
    cohorts: shaped,
    currencyCode: currencyFromReports([response]),
    quota: quotaFromReports([response], "core"),
    dataQualityNotices: dataQualityNoticesForReport(
      response.metadata,
      RETENTION_SCOPE,
    ),
    isEmpty: shaped.every((cohort) => cohort.totalUsers === 0),
  };
}
```

- [ ] **Step 22: Run it and make it pass**

Run: `npx vitest run src/features/analytics/analytics-retention.test.ts`
Expected: PASS

- [ ] **Step 23: Write the failing insights test**

Create `src/features/analytics/analytics-insights.test.ts`:

```ts
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
```

- [ ] **Step 24: Run it, watch it fail, then write `analytics-insights.ts`**

Run: `npx vitest run src/features/analytics/analytics-insights.test.ts`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/analytics-insights.ts`:

```ts
import { normalizePlatform } from "./analytics-filters";
import {
  formatCount,
  formatMetric,
  formatPercentPoints,
  formatSignificantPercent,
  percentChange,
} from "./analytics-format";
import type {
  AnalyticsInsight,
  AnalyticsInsightSeverity,
  AnalyticsMetricValue,
  AnalyticsPlatformBreakdown,
} from "./types";

/**
 * Sentences an operator can act on, computed from the overview numbers already
 * fetched — no extra GA4 request.
 *
 * The thresholds exist to stop the panel from crying wolf: a 40 % swing on 12
 * users is noise, and a screen that says so every morning gets ignored on the
 * morning it matters.
 */
export const DEFAULT_INSIGHT_THRESHOLDS = {
  totalDeltaPercent: 20,
  totalBaseUsers: 50,
  revenueBase: 1,
  engagementPointDelta: 5,
  platformDeltaPercent: 25,
  platformBaseUsers: 30,
  shareShiftPoints: 10,
  maxInsights: 5,
} as const;

export type InsightThresholds = typeof DEFAULT_INSIGHT_THRESHOLDS;

const COUNT_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "keyEvents",
] as const;

const SEVERITY_ORDER: Record<AnalyticsInsightSeverity, number> = {
  warning: 0,
  positive: 1,
  info: 2,
};

export type BuildInsightsInput = {
  metrics: readonly AnalyticsMetricValue[];
  platforms: readonly AnalyticsPlatformBreakdown[];
  currencyCode: string;
};

export function buildInsights(
  input: BuildInsightsInput,
  thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const byKey = new Map(input.metrics.map((metric) => [metric.key, metric]));

  for (const key of COUNT_METRICS) {
    const metric = byKey.get(key);
    if (!metric || metric.previousValue === undefined) continue;
    if (metric.previousValue < thresholds.totalBaseUsers) continue;
    const delta = percentChange(metric.value, metric.previousValue);
    if (delta === null || Math.abs(delta) < thresholds.totalDeltaPercent) continue;

    insights.push({
      id: `total:${key}`,
      severity: delta < 0 ? "warning" : "positive",
      text: `${metric.label} ${formatSignificantPercent(delta)} ${
        delta < 0 ? "감소" : "증가"
      } (${formatCount(metric.previousValue)} → ${formatCount(metric.value)})`,
      metric: key,
      scope: "total",
      delta,
      current: metric.value,
      previous: metric.previousValue,
    });
  }

  const engagement = byKey.get("engagementRate");
  if (engagement && engagement.previousValue !== undefined) {
    // GA4 reports the rate as a fraction. Rounding to a tenth of a point first
    // keeps 0.574 → 0.512 from landing at 6.199999999999994 and, worse, keeps a
    // clean −5.0 from falling just under the threshold.
    const points =
      Math.round((engagement.value - engagement.previousValue) * 1_000) / 10;
    if (Math.abs(points) >= thresholds.engagementPointDelta) {
      insights.push({
        id: "total:engagementRate",
        severity: points < 0 ? "warning" : "positive",
        text: `${engagement.label} ${formatPercentPoints(points)} ${
          points < 0 ? "하락" : "상승"
        }`,
        metric: "engagementRate",
        scope: "total",
        delta: points,
        current: engagement.value,
        previous: engagement.previousValue,
      });
    }
  }

  const revenue = byKey.get("totalRevenue");
  if (
    revenue &&
    revenue.previousValue !== undefined &&
    revenue.previousValue >= thresholds.revenueBase
  ) {
    const delta = percentChange(revenue.value, revenue.previousValue);
    if (delta !== null && Math.abs(delta) >= thresholds.totalDeltaPercent) {
      insights.push({
        id: "total:totalRevenue",
        severity: delta < 0 ? "warning" : "positive",
        text: `${revenue.label} ${formatSignificantPercent(delta)} ${
          delta < 0 ? "감소" : "증가"
        } (${formatMetric(revenue.previousValue, "currency", input.currencyCode)} → ${formatMetric(
          revenue.value,
          "currency",
          input.currencyCode,
        )})`,
        metric: "totalRevenue",
        scope: "total",
        delta,
        current: revenue.value,
        previous: revenue.previousValue,
      });
    }
  }

  for (const row of input.platforms) {
    const previous = row.previous.activeUsers;
    if (previous < thresholds.platformBaseUsers) continue;
    const delta = percentChange(row.current.activeUsers, previous);
    if (delta === null || Math.abs(delta) < thresholds.platformDeltaPercent) {
      continue;
    }
    const label = normalizePlatform(row.platform);
    insights.push({
      id: `platform:${label}`,
      severity: delta < 0 ? "warning" : "positive",
      text: `${label} 유입 ${delta < 0 ? "급감" : "급증"} ${formatSignificantPercent(
        delta,
      )} (활성 사용자 ${formatCount(previous)} → ${formatCount(row.current.activeUsers)})`,
      metric: "activeUsers",
      scope: "platform",
      delta,
      current: row.current.activeUsers,
      previous,
    });
  }

  const currentTotal = input.platforms.reduce(
    (sum, row) => sum + row.current.activeUsers,
    0,
  );
  const previousTotal = input.platforms.reduce(
    (sum, row) => sum + row.previous.activeUsers,
    0,
  );
  if (currentTotal > 0 && previousTotal > 0) {
    for (const row of input.platforms) {
      const currentShare = (row.current.activeUsers / currentTotal) * 100;
      const previousShare = (row.previous.activeUsers / previousTotal) * 100;
      const shift = currentShare - previousShare;
      if (Math.abs(shift) < thresholds.shareShiftPoints) continue;
      const label = normalizePlatform(row.platform);
      insights.push({
        id: `share:${label}`,
        // A mix shift is context, not an alarm: the total may be unchanged.
        severity: "info",
        text: `${label} 비중 ${Math.round(previousShare)}% → ${Math.round(
          currentShare,
        )}%`,
        metric: "activeUsersShare",
        scope: "platform",
        delta: shift,
        current: currentShare,
        previous: previousShare,
      });
    }
  }

  if (insights.length === 0) {
    const activeUsers = byKey.get("activeUsers");
    const previous = activeUsers?.previousValue ?? 0;
    // Silence has two meanings. Say which one this is.
    if (previous < thresholds.totalBaseUsers) {
      return [
        {
          id: "info:small-base",
          severity: "info",
          text: "비교 기준이 작아 유의미한 변화를 판단하지 않았습니다.",
          metric: "activeUsers",
          scope: "total",
          delta: null,
          current: activeUsers?.value ?? 0,
          previous,
        },
      ];
    }
    return [];
  }

  return insights
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) ||
        a.metric.localeCompare(b.metric) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, thresholds.maxInsights);
}
```

- [ ] **Step 25: Run it and make it pass**

Run: `npx vitest run src/features/analytics/analytics-insights.test.ts`
Expected: PASS

- [ ] **Step 26: Run the whole analytics suite and type-check**

Run: `npx vitest run src/features/analytics`
Expected: PASS except `analytics-reports.test.ts` / `AnalyticsDashboard.test.tsx`, which still reference `AnalyticsOverviewResult.trend` — Task 3 replaces it. If either fails for that reason and nothing else, that is expected; note it and continue.

Run: `npx tsc --noEmit`
Expected: the same `trend`-related errors in `analytics-reports.ts` and `AnalyticsDashboard.tsx` and nothing else.

- [ ] **Step 27: Commit 2B**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics
git rev-parse --abbrev-ref HEAD   # must print feat/analytics-analysis
git add src/features/analytics/funnel-definitions.ts src/features/analytics/funnel-definitions.test.ts \
  src/features/analytics/analytics-funnel.ts src/features/analytics/analytics-funnel.test.ts \
  src/features/analytics/analytics-retention.ts src/features/analytics/analytics-retention.test.ts \
  src/features/analytics/analytics-insights.ts src/features/analytics/analytics-insights.test.ts
git commit -m "$(cat <<'MSG'
feat(analytics): add funnel, weekly retention and insight rules as pure modules

Three closed funnel presets built from event parameters the app already sends,
matching both the /v2-prefixed and the pre-fix duplicated-id route templates so
older builds are not silently dropped from the last step. Funnel shaping reads
GA4's ordinal step prefix, treats RESERVED_TOTAL as the funnel itself, parses
the completion and abandonment rates as fractions despite their TYPE_INTEGER
header, and nulls them on the last step where they describe nothing.

Retention builds six complete Sunday-Saturday cohorts and asks for five weekly
offsets in one Core request with no top-level date range, then indexes GA4's
unordered zero-padded week values and marks unfinished weeks instead of drawing
them as a drop to zero.

Insights turn the overview totals and platform split into at most five Korean
sentences, with thresholds that keep a 40% swing on twelve users quiet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 3: `analytics-reports.ts` — comparison overview, filter threading, dispatcher, capabilities

**Files:**
- Modify: `src/features/analytics/analytics-reports.ts` (whole file; after Task 2 it is roughly `FetchAnalyticsReportInput` + `fetchOverview` + `coreRequest`/`definitionsForView` + `fetchCoreTables` + `fetchRealtime` + `fetchAnalyticsReport`)
- Test: `src/features/analytics/analytics-reports.test.ts` (rewrite the overview cases, add five)

**Interfaces:**
- Consumes (Tasks 1–2): `batchRunAnalyticsReports`, `runAnalyticsRealtimeReport`, `getAnalyticsMetadata`, `DATE_RANGE_DIMENSION`; `analyticsDateRange`, `RANGE_DAYS`, `reportRows`, `firstMetric`, `numericValue`, `quotaFromReports`, `currencyFromReports`, `dataQualityNoticesForReport`, `emptyReport`; `buildDimensionFilter`, `normalizePlatform`, `ACCOUNT_TYPE_DIMENSION`, `EMPTY_FILTERS`, `type AnalyticsFilters`; `fetchFunnel`; `fetchRetention`; `buildInsights`; `type FunnelId`; `ANALYTICS_TREND_METRICS` and the result types from `types.ts`.
- Produces, for Tasks 4–5:

```ts
export type FetchAnalyticsReportInput = {
  view: AnalyticsReportView;
  property: AnalyticsPropertyConfig;
  range: AnalyticsDateRange;
  filters: AnalyticsFilters;
  funnelId?: FunnelId;          // defaults to "party-apply"
  funnelBreakdown?: boolean;    // defaults to false
  accessToken: string;
  signal?: AbortSignal;
};
export function fetchAnalyticsReport(input: FetchAnalyticsReportInput): Promise<AnalyticsReportResult>;

export type AnalyticsCapabilities = { accountTypeDimension: boolean; customDimensions: string[] };
export function fetchAnalyticsCapabilities(input: { propertyId: string; accessToken: string; signal?: AbortSignal }): Promise<AnalyticsCapabilities>;
```

**Verified deviation from the spec:** the spec says the two-range requests are "named `current`/`previous`" and reads the `dateRange` column back by those names. The Data API docs show the column's values as the **positional** `date_range_0` / `date_range_1` when the ranges carry no `name`, and do not document what a supplied `name` produces. The names are still sent (they make the request readable), but `rangeSlot()` accepts **either** form and a value it recognises as neither is dropped rather than guessed at. That is the difference between an aligned comparison and one silently offset by a period.

- [ ] **Step 1: Rewrite the overview test**

In `src/features/analytics/analytics-reports.test.ts`, extend the mock factory at lines 4–11 to

```ts
vi.mock("./analytics-data-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analytics-data-api")>();
  return {
    ...actual,
    batchRunAnalyticsReports: vi.fn(),
    runAnalyticsRealtimeReport: vi.fn(),
    getAnalyticsMetadata: vi.fn(),
  };
});

vi.mock("./analytics-funnel", () => ({ fetchFunnel: vi.fn() }));
vi.mock("./analytics-retention", () => ({ fetchRetention: vi.fn() }));
```

widen the imports at lines 13–18 to

```ts
import {
  AnalyticsDataApiError,
  batchRunAnalyticsReports,
  getAnalyticsMetadata,
  runAnalyticsRealtimeReport,
} from "./analytics-data-api";
import { EMPTY_FILTERS } from "./analytics-filters";
import { fetchFunnel } from "./analytics-funnel";
import { fetchRetention } from "./analytics-retention";
import {
  fetchAnalyticsCapabilities,
  fetchAnalyticsReport,
} from "./analytics-reports";
```

change `baseInput` (lines 55–59) to

```ts
const baseInput = {
  property: { id: "1234", label: "Dopa", platform: "mixed" as const },
  range: "28d" as const,
  filters: EMPTY_FILTERS,
  accessToken: "memory-token",
};

const OVERVIEW_SUMMARY_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "engagementRate",
  "keyEvents",
  "totalRevenue",
];
```

and replace the first `it` ("builds current, previous and trend reports for overview", lines 67–128) with:

```ts
  it("compares two named ranges in one batch and derives series, platforms and insights", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["100", "40", "120", "0.5", "10", "30000"] }],
        }),
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["80", "30", "90", "0.4", "8", "25000"] }],
        }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["20260901", "current"], metrics: ["10", "4", "12"] },
            { dimensions: ["20260903", "current"], metrics: ["20", "5", "22"] },
            { dimensions: ["20260804", "previous"], metrics: ["8", "3", "9"] },
            { dimensions: ["20260805", "previous"], metrics: ["9", "3", "10"] },
            { dimensions: ["20260806", "previous"], metrics: ["7", "2", "8"] },
          ],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["iOS", "current"], metrics: ["60", "20", "70"] },
            { dimensions: ["iOS", "previous"], metrics: ["50", "18", "60"] },
            { dimensions: ["Android", "current"], metrics: ["40", "20", "50"] },
            { dimensions: ["Android", "previous"], metrics: ["30", "12", "30"] },
          ],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    if (result.view !== "overview") throw new Error("Expected overview result");
    expect(result.metrics[0]).toMatchObject({
      key: "activeUsers",
      value: 100,
      previousValue: 80,
    });

    const requests = vi.mocked(batchRunAnalyticsReports).mock.calls[0]?.[1].requests;
    expect(requests).toHaveLength(4);
    expect(requests?.[0]?.dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday" },
    ]);
    expect(requests?.[1]?.dateRanges).toEqual([
      { startDate: "56daysAgo", endDate: "29daysAgo" },
    ]);
    expect(requests?.[2]?.dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday", name: "current" },
      { startDate: "56daysAgo", endDate: "29daysAgo", name: "previous" },
    ]);
    expect(requests?.[2]?.limit).toBe(56);
    expect(requests?.[3]?.dimensions).toEqual([{ name: "platform" }]);

    // A day GA4 never returned is a zero, not a hole — and its previous-period
    // partner still lines up by position.
    expect(result.series.points).toEqual([
      {
        date: "20260901",
        previousDate: "20260804",
        current: { activeUsers: 10, newUsers: 4, sessions: 12 },
        previous: { activeUsers: 8, newUsers: 3, sessions: 9 },
      },
      {
        date: "20260902",
        previousDate: "20260805",
        current: { activeUsers: 0, newUsers: 0, sessions: 0 },
        previous: { activeUsers: 9, newUsers: 3, sessions: 10 },
      },
      {
        date: "20260903",
        previousDate: "20260806",
        current: { activeUsers: 20, newUsers: 5, sessions: 22 },
        previous: { activeUsers: 7, newUsers: 2, sessions: 8 },
      },
    ]);

    expect(result.platforms).toEqual([
      {
        platform: "iOS",
        current: { activeUsers: 60, newUsers: 20, sessions: 70 },
        previous: { activeUsers: 50, newUsers: 18, sessions: 60 },
      },
      {
        platform: "Android",
        current: { activeUsers: 40, newUsers: 20, sessions: 50 },
        previous: { activeUsers: 30, newUsers: 12, sessions: 30 },
      },
    ]);

    expect(result.insights.map(({ id }) => id)).toEqual([
      "platform:Android",
      "total:sessions",
      "total:activeUsers",
      "total:totalRevenue",
      "total:engagementRate",
    ]);
    expect(result.quota?.category).toBe("core");
    expect(result.isEmpty).toBe(false);
  });

  it("reads GA4's positional date-range values as well as the names it was given", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["1", "1", "1", "0", "0", "0"] }] }),
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["1", "1", "1", "0", "0", "0"] }] }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["20260901", "date_range_0"], metrics: ["10", "4", "12"] },
            { dimensions: ["20260804", "date_range_1"], metrics: ["8", "3", "9"] },
            { dimensions: ["20260805", "somethingElse"], metrics: ["99", "99", "99"] },
          ],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    if (result.view !== "overview") throw new Error("Expected overview result");
    expect(result.series.points).toEqual([
      {
        date: "20260901",
        previousDate: "20260804",
        current: { activeUsers: 10, newUsers: 4, sessions: 12 },
        previous: { activeUsers: 8, newUsers: 3, sessions: 9 },
      },
    ]);
  });
```

- [ ] **Step 2: Update the two overview cases that still assume three reports**

In the same file, replace the three-report array in "marks a report with no rows and zero summary values as empty" (lines 298–314) and in "rejects a malformed numeric metric…" (lines 316–356) with four-report arrays whose reports 2 and 3 carry the extra `dateRange` dimension:

```ts
  it("marks a report with no rows and zero summary values as empty", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }] }),
        report({ metrics: OVERVIEW_SUMMARY_METRICS, rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }] }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [
            { dimensions: ["20260830", "current"], metrics: ["0", "0", "0"] },
          ],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
      ],
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "overview" });

    expect(result.isEmpty).toBe(true);
  });

  it("rejects a malformed numeric metric instead of presenting it as a real zero", async () => {
    vi.mocked(batchRunAnalyticsReports).mockResolvedValue({
      reports: [
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["not-a-number", "0", "0", "0", "0", "0"] }],
        }),
        report({
          metrics: OVERVIEW_SUMMARY_METRICS,
          rows: [{ metrics: ["0", "0", "0", "0", "0", "0"] }],
        }),
        report({
          dimensions: ["date", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
        report({
          dimensions: ["platform", "dateRange"],
          metrics: ["activeUsers", "newUsers", "sessions"],
          rows: [],
        }),
      ],
    });

    await expect(
      fetchAnalyticsReport({ ...baseInput, view: "overview" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({
        kind: "invalid-response",
      }),
    );
  });
```

- [ ] **Step 3: Add the filter, dispatcher and capability tests**

Append these five `it` blocks inside the existing `describe("fetchAnalyticsReport", …)`, and add `fetchFunnel`/`fetchRetention`/`getAnalyticsMetadata` resets to its `beforeEach` (lines 62–65):

```ts
  beforeEach(() => {
    vi.mocked(batchRunAnalyticsReports).mockReset();
    vi.mocked(runAnalyticsRealtimeReport).mockReset();
    vi.mocked(getAnalyticsMetadata).mockReset();
    vi.mocked(fetchFunnel).mockReset();
    vi.mocked(fetchRetention).mockReset();
  });
```

```ts
  it("attaches the same dimension filter to every core request", async () => {
    vi.mocked(batchRunAnalyticsReports).mockImplementation(async (_id, body) => ({
      reports: body.requests.map((request) =>
        report({
          dimensions: request.dimensions?.map(({ name }) => name) ?? [],
          metrics: request.metrics.map(({ name }) => name),
          rows: [],
        }),
      ),
    }));

    await fetchAnalyticsReport({
      ...baseInput,
      view: "acquisition",
      filters: { platforms: ["iOS"], accountType: "business" },
    });

    const expected = {
      andGroup: {
        expressions: [
          { filter: { fieldName: "platform", inListFilter: { values: ["iOS"] } } },
          {
            filter: {
              fieldName: "customUser:account_type",
              stringFilter: { matchType: "EXACT", value: "business" },
            },
          },
        ],
      },
    };
    for (const request of vi.mocked(batchRunAnalyticsReports).mock.calls[0]?.[1]
      .requests ?? []) {
      expect(request.dimensionFilter).toEqual(expected);
    }
  });

  it("never filters the realtime reports", async () => {
    vi.mocked(runAnalyticsRealtimeReport).mockImplementation(async (_id, request) =>
      report({
        dimensions: request.dimensions?.map(({ name }) => name) ?? [],
        metrics: request.metrics.map(({ name }) => name),
        rows: [],
      }),
    );

    await fetchAnalyticsReport({
      ...baseInput,
      view: "realtime",
      filters: { platforms: ["Android"], accountType: "consumer" },
    });

    for (const [, request] of vi.mocked(runAnalyticsRealtimeReport).mock.calls) {
      expect(request).not.toHaveProperty("dimensionFilter");
    }
  });

  it("hands the funnel view to the funnel module with its preset and breakdown", async () => {
    vi.mocked(fetchFunnel).mockResolvedValue({
      view: "funnel",
      funnelId: "party-payment",
      title: "결제",
      description: "결제 화면 진입부터 승인까지의 단계별 이탈입니다.",
      steps: [],
      breakdown: null,
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: true,
    });

    const result = await fetchAnalyticsReport({
      ...baseInput,
      view: "funnel",
      funnelId: "party-payment",
      funnelBreakdown: true,
    });

    expect(result.view).toBe("funnel");
    expect(fetchFunnel).toHaveBeenCalledWith(
      expect.objectContaining({
        funnelId: "party-payment",
        breakdown: true,
        range: "28d",
        accessToken: "memory-token",
      }),
    );
    expect(batchRunAnalyticsReports).not.toHaveBeenCalled();
  });

  it("hands the retention view to the retention module and ignores the date range", async () => {
    vi.mocked(fetchRetention).mockResolvedValue({
      view: "retention",
      granularity: "WEEKLY",
      horizon: 4,
      cohorts: [],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: true,
    });

    const result = await fetchAnalyticsReport({ ...baseInput, view: "retention" });

    expect(result.view).toBe("retention");
    const [call] = vi.mocked(fetchRetention).mock.calls;
    expect(call?.[0]).not.toHaveProperty("range");
    expect(call?.[0]).toMatchObject({ accessToken: "memory-token" });
  });

  it("asks the property whether account_type exists before offering the filter", async () => {
    vi.mocked(getAnalyticsMetadata).mockResolvedValue({
      dimensions: [
        { apiName: "platform" },
        { apiName: "customUser:account_type", customDefinition: true },
        { apiName: "customUser:dopa_uid", customDefinition: true },
      ],
      metrics: [],
    });

    await expect(
      fetchAnalyticsCapabilities({ propertyId: "1234", accessToken: "memory-token" }),
    ).resolves.toEqual({
      accountTypeDimension: true,
      customDimensions: ["customUser:account_type", "customUser:dopa_uid"],
    });

    vi.mocked(getAnalyticsMetadata).mockResolvedValue({
      dimensions: [{ apiName: "platform" }],
      metrics: [],
    });

    await expect(
      fetchAnalyticsCapabilities({ propertyId: "1234", accessToken: "memory-token" }),
    ).resolves.toEqual({ accountTypeDimension: false, customDimensions: [] });
  });
```

- [ ] **Step 4: Run the file and watch it fail**

Run: `npx vitest run src/features/analytics/analytics-reports.test.ts`
Expected: FAIL — `fetchAnalyticsCapabilities` is not exported, the overview still issues three requests and returns `trend`, and no request carries a `dimensionFilter`.

- [ ] **Step 5: Rewrite `fetchOverview` and its shaping helpers**

In `src/features/analytics/analytics-reports.ts`, add to the imports:

```ts
import {
  DATE_RANGE_DIMENSION,
  getAnalyticsMetadata,
} from "./analytics-data-api";
import {
  ACCOUNT_TYPE_DIMENSION,
  buildDimensionFilter,
  normalizePlatform,
  type AnalyticsFilters,
} from "./analytics-filters";
import { fetchFunnel } from "./analytics-funnel";
import { buildInsights } from "./analytics-insights";
import { fetchRetention } from "./analytics-retention";
import { FUNNEL_IDS, type FunnelId } from "./funnel-definitions";
import {
  ANALYTICS_TREND_METRICS,
  type AnalyticsPlatformBreakdown,
  type AnalyticsTrendSeries,
  type AnalyticsTrendValues,
} from "./types";
```

Replace the `FetchAnalyticsReportInput` type (lines 22–28) with:

```ts
export type FetchAnalyticsReportInput = {
  view: AnalyticsReportView;
  property: AnalyticsPropertyConfig;
  range: AnalyticsDateRange;
  filters: AnalyticsFilters;
  /** Only read by the funnel view. */
  funnelId?: FunnelId;
  funnelBreakdown?: boolean;
  accessToken: string;
  signal?: AbortSignal;
};
```

Add these module-level helpers next to the other private functions:

```ts
const CURRENT_RANGE_NAME = "current";
const PREVIOUS_RANGE_NAME = "previous";
const DAY_MS = 86_400_000;

const ZERO_TREND: AnalyticsTrendValues = {
  activeUsers: 0,
  newUsers: 0,
  sessions: 0,
};

function namedRanges(range: AnalyticsDateRange) {
  return [
    { ...analyticsDateRange(range), name: CURRENT_RANGE_NAME },
    { ...analyticsDateRange(range, true), name: PREVIOUS_RANGE_NAME },
  ];
}

/**
 * Which of the two requested windows a row belongs to.
 *
 * GA4's documented values for the implicit `dateRange` column are positional
 * (`date_range_0`, `date_range_1`); what it does with a supplied `name` is not
 * documented. Accept both, and drop anything else rather than guess — a row
 * assigned to the wrong window shifts the entire comparison by one period.
 */
function rangeSlot(value: string): "current" | "previous" | null {
  if (value === CURRENT_RANGE_NAME || value === "date_range_0") return "current";
  if (value === PREVIOUS_RANGE_NAME || value === "date_range_1") return "previous";
  return null;
}

function trendValues(row: Record<string, string>): AnalyticsTrendValues {
  return {
    activeUsers: numericValue(row.activeUsers),
    newUsers: numericValue(row.newUsers),
    sessions: numericValue(row.sessions),
  };
}

function parseGaDay(value: string): number {
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
  );
}

function formatGaDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10).replaceAll("-", "");
}

/**
 * GA4 omits a day with no events entirely. Left as-is, the chart would draw a
 * straight line across the gap and hide the outage that caused it.
 */
function fillMissingDates(dates: readonly string[]): string[] {
  const valid = [...dates].filter((date) => /^\d{8}$/.test(date)).sort();
  const first = valid[0];
  const last = valid.at(-1);
  if (first === undefined || last === undefined) return [];

  const filled: string[] = [];
  for (
    let cursor = parseGaDay(first);
    cursor <= parseGaDay(last);
    cursor += DAY_MS
  ) {
    filled.push(formatGaDay(cursor));
  }
  return filled;
}

function shapeSeries(
  report: AnalyticsReportResponse | undefined,
): AnalyticsTrendSeries {
  if (!report) return { points: [] };
  const current = new Map<string, AnalyticsTrendValues>();
  const previous = new Map<string, AnalyticsTrendValues>();

  for (const row of reportRows(report)) {
    const slot = rangeSlot(row[DATE_RANGE_DIMENSION] ?? "");
    if (slot === null) continue;
    (slot === "current" ? current : previous).set(row.date ?? "", trendValues(row));
  }

  const currentDates = fillMissingDates([...current.keys()]);
  const previousDates = fillMissingDates([...previous.keys()]);
  return {
    points: currentDates.map((date, index) => {
      const previousDate = previousDates[index] ?? null;
      return {
        date,
        previousDate,
        current: current.get(date) ?? ZERO_TREND,
        previous:
          previousDate === null
            ? null
            : (previous.get(previousDate) ?? ZERO_TREND),
      };
    }),
  };
}

function shapePlatforms(
  report: AnalyticsReportResponse | undefined,
): AnalyticsPlatformBreakdown[] {
  if (!report) return [];
  const byPlatform = new Map<
    string,
    { current: AnalyticsTrendValues; previous: AnalyticsTrendValues }
  >();

  for (const row of reportRows(report)) {
    const slot = rangeSlot(row[DATE_RANGE_DIMENSION] ?? "");
    if (slot === null) continue;
    const platform = normalizePlatform(row.platform ?? "");
    const entry = byPlatform.get(platform) ?? {
      current: ZERO_TREND,
      previous: ZERO_TREND,
    };
    // Assigned by branch, not by a computed key: a union-typed computed
    // property name widens the object type and loses `current`/`previous`.
    const next = { ...entry };
    if (slot === "current") next.current = trendValues(row);
    else next.previous = trendValues(row);
    byPlatform.set(platform, next);
  }

  return Array.from(byPlatform, ([platform, entry]) => ({ platform, ...entry })).sort(
    (a, b) =>
      b.current.activeUsers - a.current.activeUsers ||
      a.platform.localeCompare(b.platform),
  );
}
```

Then replace `fetchOverview` (lines 231–288) with:

```ts
async function fetchOverview(
  input: FetchAnalyticsReportInput,
): Promise<AnalyticsReportResult> {
  const dimensionFilter = buildDimensionFilter(input.filters);
  const filtered = (request: AnalyticsRunReportRequest) =>
    dimensionFilter ? { ...request, dimensionFilter } : request;

  const requests: AnalyticsRunReportRequest[] = [
    filtered({
      dateRanges: [analyticsDateRange(input.range)],
      metrics: metricRequests(OVERVIEW_METRICS),
      returnPropertyQuota: true,
    }),
    filtered({
      dateRanges: [analyticsDateRange(input.range, true)],
      metrics: metricRequests(OVERVIEW_METRICS),
      returnPropertyQuota: true,
    }),
    // Both windows in one request: GA4 adds its own trailing `dateRange`
    // dimension, which is one report instead of two and keeps the comparison
    // inside a single quota charge.
    filtered({
      dateRanges: namedRanges(input.range),
      dimensions: dimensionRequests(["date"]),
      metrics: metricRequests(ANALYTICS_TREND_METRICS),
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 2 * RANGE_DAYS[input.range],
      returnPropertyQuota: true,
    }),
    filtered({
      dateRanges: namedRanges(input.range),
      dimensions: dimensionRequests(["platform"]),
      metrics: metricRequests(ANALYTICS_TREND_METRICS),
      orderBys: [{ desc: true, metric: { metricName: "activeUsers" } }],
      limit: 20,
      returnPropertyQuota: true,
    }),
  ];

  const response = await batchRunAnalyticsReports(
    input.property.id,
    { requests },
    apiOptions(input),
  );
  const [current, previous, seriesReport, platformReport] = response.reports;

  const metrics = OVERVIEW_METRICS.map<AnalyticsMetricValue>((key) => ({
    key,
    label: FIELD_LABELS[key],
    value: firstMetric(current, key),
    previousValue: firstMetric(previous, key),
    format: FIELD_FORMATS[key] ?? "integer",
  }));
  const series = shapeSeries(seriesReport);
  const platforms = shapePlatforms(platformReport);
  const currencyCode = currencyFromReports(response.reports);
  const qualityDefinitions = [
    { key: "current-summary", title: "현재 기간 핵심 지표" },
    { key: "previous-summary", title: "이전 기간 핵심 지표" },
    { key: "daily-series", title: "일별 추세" },
    { key: "platform-split", title: "플랫폼 비교" },
  ];

  return {
    view: "overview",
    metrics,
    series,
    platforms,
    insights: buildInsights({ metrics, platforms, currencyCode }),
    currencyCode,
    quota: quotaFromReports(response.reports, "core"),
    dataQualityNotices: dataQualityNoticesFromReports(
      response.reports,
      qualityDefinitions,
    ),
    isEmpty:
      metrics.every(({ value }) => value === 0) &&
      series.points.every(
        ({ current: point }) =>
          point.activeUsers === 0 && point.newUsers === 0 && point.sessions === 0,
      ),
  };
}
```

- [ ] **Step 6: Thread the filter through the table views and add the dispatcher + capabilities**

In the same file, give `coreRequest` and `definitionsForView` the filter, and rewrite the dispatcher:

```ts
function coreRequest(
  range: AnalyticsDateRange,
  dimensions: readonly string[],
  metrics: readonly string[],
  orderMetric: string,
  dimensionFilter?: AnalyticsFilterExpression,
): AnalyticsRunReportRequest {
  return {
    dateRanges: [analyticsDateRange(range)],
    dimensions: dimensionRequests(dimensions),
    metrics: metricRequests(metrics),
    orderBys: [{ desc: true, metric: { metricName: orderMetric } }],
    limit: 25,
    ...(dimensionFilter ? { dimensionFilter } : {}),
    returnPropertyQuota: true,
  };
}

function definitionsForView(
  view: "acquisition" | "engagement" | "conversion-revenue",
  range: AnalyticsDateRange,
  dimensionFilter?: AnalyticsFilterExpression,
): ReportDefinition[] {
  if (view === "acquisition") {
    return [
      {
        key: "channels",
        title: "채널·소스·캠페인",
        description: "세션 기준 유입 경로와 주요 이벤트를 비교합니다.",
        request: coreRequest(
          range,
          [
            "sessionDefaultChannelGroup",
            "sessionSource",
            "sessionMedium",
            "sessionCampaignName",
          ],
          ["sessions", "engagedSessions", "keyEvents"],
          "sessions",
          dimensionFilter,
        ),
      },
      {
        key: "landing-pages",
        title: "랜딩 페이지",
        description: "처음 유입된 페이지별 참여 품질입니다.",
        request: coreRequest(
          range,
          ["landingPagePlusQueryString"],
          ["activeUsers", "sessions", "engagementRate", "keyEvents"],
          "sessions",
          dimensionFilter,
        ),
      },
    ];
  }
  if (view === "engagement") {
    return [
      {
        key: "pages-screens",
        title: "페이지·화면",
        description: "웹 페이지와 앱 화면을 하나의 기준으로 비교합니다.",
        request: coreRequest(
          range,
          ["unifiedPageScreen"],
          ["screenPageViews", "activeUsers", "userEngagementDuration"],
          "screenPageViews",
          dimensionFilter,
        ),
      },
      {
        key: "events",
        title: "이벤트",
        description: "제품 이벤트의 발생량과 주요 이벤트 지정 상태입니다.",
        request: coreRequest(
          range,
          ["eventName"],
          ["eventCount", "totalUsers", "keyEvents"],
          "eventCount",
          dimensionFilter,
        ),
      },
    ];
  }
  return [
    {
      key: "key-events",
      title: "전환 이벤트",
      description: "이벤트별 주요 이벤트 수와 도달 사용자를 확인합니다.",
      request: coreRequest(
        range,
        ["eventName"],
        ["eventCount", "keyEvents", "totalUsers"],
        "keyEvents",
        dimensionFilter,
      ),
    },
    {
      key: "revenue-summary",
      title: "구매·매출",
      description: "GA4 전자상거래 이벤트가 수집된 경우에만 표시됩니다.",
      request: {
        dateRanges: [analyticsDateRange(range)],
        metrics: metricRequests([
          "ecommercePurchases",
          "purchaseRevenue",
          "totalRevenue",
        ]),
        ...(dimensionFilter ? { dimensionFilter } : {}),
        returnPropertyQuota: true,
      },
    },
  ];
}
```

(`AnalyticsFilterExpression` comes from `./analytics-data-api`; add it to that import.) In `fetchCoreTables`, build the filter once and pass it down:

```ts
  const definitions = definitionsForView(
    input.view,
    input.range,
    buildDimensionFilter(input.filters),
  );
```

Finally replace `fetchAnalyticsReport` (lines 522–528) with:

```ts
export function fetchAnalyticsReport(
  input: FetchAnalyticsReportInput,
): Promise<AnalyticsReportResult> {
  if (input.view === "overview") return fetchOverview(input);
  if (input.view === "realtime") return fetchRealtime(input);
  if (input.view === "funnel") {
    return fetchFunnel({
      property: input.property,
      range: input.range,
      filters: input.filters,
      funnelId: input.funnelId ?? FUNNEL_IDS[0],
      breakdown: input.funnelBreakdown ?? false,
      accessToken: input.accessToken,
      signal: input.signal,
    });
  }
  if (input.view === "retention") {
    // No `range`: the cohort window is fixed at the last six complete weeks.
    return fetchRetention({
      property: input.property,
      filters: input.filters,
      accessToken: input.accessToken,
      signal: input.signal,
    });
  }
  return fetchCoreTables({ ...input, view: input.view });
}

export type AnalyticsCapabilities = {
  accountTypeDimension: boolean;
  customDimensions: string[];
};

/**
 * What this GA4 property can actually be asked.
 *
 * Offering an account-type filter a property has no custom dimension for turns
 * every filtered report into a 400 that reads like an app bug. One metadata
 * read, cached forever, answers it instead.
 */
export async function fetchAnalyticsCapabilities(input: {
  propertyId: string;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<AnalyticsCapabilities> {
  const metadata = await getAnalyticsMetadata(input.propertyId, {
    accessToken: input.accessToken,
    signal: input.signal,
  });
  return {
    accountTypeDimension: metadata.dimensions.some(
      ({ apiName }) => apiName === ACCOUNT_TYPE_DIMENSION,
    ),
    customDimensions: metadata.dimensions
      .filter((dimension) => dimension.customDefinition === true)
      .map(({ apiName }) => apiName)
      .sort(),
  };
}
```

Also update `fetchRealtime`'s `quotaFromReports(reports)` call to `quotaFromReports(reports, "realtime")` if Task 2 Step 7 did not already, and leave every realtime request without a `dimensionFilter`.

- [ ] **Step 7: Run the file and make it pass**

Run: `npx vitest run src/features/analytics/analytics-reports.test.ts`
Expected: PASS

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: only `AnalyticsDashboard.tsx` errors remain (it still reads `result.trend` and calls `fetchAnalyticsReport` without `filters`). Task 4 fixes them.

- [ ] **Step 9: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics
git rev-parse --abbrev-ref HEAD   # must print feat/analytics-analysis
git add src/features/analytics/analytics-reports.ts src/features/analytics/analytics-reports.test.ts
git commit -m "$(cat <<'MSG'
feat(analytics): compare two periods in the overview and dispatch funnel/retention

The overview now asks for both windows in one request each for the daily series
and the platform split, so GA4 appends its implicit dateRange dimension and the
comparison costs one batch instead of two. Rows are assigned to a window by
accepting either the names we send or GA4's documented positional values, and a
value that is neither is dropped rather than guessed at — a misassigned row
would shift the whole comparison by a period. Days GA4 omitted are zero-filled
so the chart shows the outage instead of drawing across it.

Platform and account-type filters thread into every core request; realtime
stays unfiltered. fetchAnalyticsCapabilities reads the property's metadata once
so the account-type filter is only offered where the custom dimension exists.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 4: UI — trend chart, filter bar, insights, funnel, retention heatmap, dashboard wiring

**Files:**
- Create: `src/features/analytics/charts/TrendChart.tsx` + `charts/TrendChart.test.tsx`
- Create: `src/features/analytics/AnalyticsFilterBar.tsx` + `.test.tsx`
- Create: `src/features/analytics/InsightsPanel.tsx` + `.test.tsx`
- Create: `src/features/analytics/FunnelPanel.tsx` + `.test.tsx`
- Create: `src/features/analytics/RetentionHeatmap.tsx` + `.test.tsx`
- Modify: `src/features/analytics/analytics-query-keys.ts` (`report` gains two segments; add `capabilities`)
- Modify: `src/features/analytics/AnalyticsStates.tsx` (`QuotaFooter` names the pool; add `QuotaBanner`)
- Modify: `src/features/analytics/AnalyticsDashboard.tsx` (state, tabs, filter bar, lazy chart, panels, quota UX)
- Modify: `src/features/analytics/AnalyticsDashboard.test.tsx` (extend the module mock, replace the trend test, add five)

**Interfaces:**
- Consumes (Tasks 1–3): `fetchAnalyticsReport`, `fetchAnalyticsCapabilities`, `type AnalyticsCapabilities`; `EMPTY_FILTERS`, `filtersKey`, `activeFilterCount`, `togglePlatform`, `availablePlatforms`, `type AnalyticsFilters`, `type AnalyticsPlatform`; `FUNNEL_IDS`, `FUNNEL_DEFINITIONS`, `type FunnelId`; `quotaPressure`, `QUOTA_POOL_LABELS`; `formatCount`, `formatRate`, `formatGaDate`, `formatMetric`, `percentChange`; every result type in `types.ts`.
- Produces, for Task 5: `AnalyticsDashboard.tsx` contains the literal `createRetryableLazyComponent<TrendChartProps>(() => import("./charts/TrendChart")` and no value import from that path.

```ts
// charts/TrendChart.tsx
export type TrendChartProps = { series: AnalyticsTrendSeries; metric: AnalyticsTrendMetric; showPrevious: boolean; width?: number };
export default function TrendChart(props: TrendChartProps): React.JSX.Element;

// AnalyticsFilterBar.tsx
export type AccountTypeAvailability = "pending" | "available" | "unavailable" | "unknown";
export type AnalyticsFilterBarProps = { filters: AnalyticsFilters; onChange: (filters: AnalyticsFilters) => void; platforms: readonly AnalyticsPlatform[]; accountTypeAvailability: AccountTypeAvailability; disabled?: boolean };
export function AnalyticsFilterBar(props: AnalyticsFilterBarProps): React.JSX.Element;

// InsightsPanel.tsx
export function InsightsPanel({ insights }: { insights: AnalyticsInsight[] }): React.JSX.Element;

// FunnelPanel.tsx
export type FunnelPanelProps = { result: AnalyticsFunnelResult; funnelId: FunnelId; onFunnelIdChange: (id: FunnelId) => void; breakdown: boolean; onBreakdownChange: (value: boolean) => void };
export function FunnelPanel(props: FunnelPanelProps): React.JSX.Element;

// RetentionHeatmap.tsx
export function RetentionHeatmap({ result }: { result: AnalyticsRetentionResult }): React.JSX.Element;

// AnalyticsStates.tsx (added)
export function QuotaBanner({ quota }: { quota: AnalyticsQuotaState | null }): React.JSX.Element | null;

// analytics-query-keys.ts (changed)
report: (generation: number, propertyId: string, view: AnalyticsReportView, range: AnalyticsDateRange, filters: string, variant: string) => readonly [...];
capabilities: (generation: number, propertyId: string) => readonly [...];
```

- [ ] **Step 1: Write the failing TrendChart test**

Create `src/features/analytics/charts/TrendChart.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TrendChart from "./TrendChart";
import type { AnalyticsTrendSeries } from "../types";

const series: AnalyticsTrendSeries = {
  points: [
    {
      date: "20260901",
      previousDate: "20260804",
      current: { activeUsers: 10, newUsers: 4, sessions: 12 },
      previous: { activeUsers: 8, newUsers: 3, sessions: 9 },
    },
    {
      date: "20260902",
      previousDate: "20260805",
      current: { activeUsers: 0, newUsers: 0, sessions: 0 },
      previous: { activeUsers: 9, newUsers: 3, sessions: 10 },
    },
    {
      date: "20260903",
      previousDate: "20260806",
      current: { activeUsers: 2000, newUsers: 5, sessions: 22 },
      previous: { activeUsers: 7, newUsers: 2, sessions: 8 },
    },
  ],
};

afterEach(cleanup);

describe("TrendChart", () => {
  it("names the metric it is drawing and lists every point in text", () => {
    render(<TrendChart series={series} metric="activeUsers" showPrevious={false} />);

    expect(
      screen.getByRole("figure", { name: "일별 추세: 활성 사용자" }),
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("2026.09.01")).toBeInTheDocument();
    expect(within(table).getByText("2,000")).toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "이전 기간" }),
    ).not.toBeInTheDocument();
  });

  it("adds the previous period only when asked", () => {
    render(<TrendChart series={series} metric="sessions" showPrevious />);

    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "이전 기간" }),
    ).toBeInTheDocument();
    // The previous cell holds a date and a value in one string, so match on a
    // substring rather than the whole cell.
    expect(within(table).getByText(/2026\.08\.04/)).toBeInTheDocument();
    expect(
      screen.getByRole("figure", { name: "일별 추세: 세션" }),
    ).toBeInTheDocument();
  });

  it("reads out both values for the point under the pointer", () => {
    const { container } = render(
      <TrendChart series={series} metric="activeUsers" showPrevious />,
    );
    const hitAreas = container.querySelectorAll("[data-point]");
    expect(hitAreas).toHaveLength(3);

    fireEvent.mouseEnter(hitAreas[0] as Element);
    const tooltip = screen.getByTestId("trend-tooltip");
    expect(tooltip).toHaveTextContent("2026.09.01");
    expect(tooltip).toHaveTextContent("10");
    expect(tooltip).toHaveTextContent("8");

    fireEvent.mouseLeave(hitAreas[0] as Element);
    expect(screen.queryByTestId("trend-tooltip")).not.toBeInTheDocument();
  });

  it("says there is nothing to draw rather than rendering an empty axis", () => {
    render(
      <TrendChart series={{ points: [] }} metric="newUsers" showPrevious={false} />,
    );

    expect(screen.getByText("표시할 일별 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then write the chart**

Run: `npx vitest run src/features/analytics/charts/TrendChart.test.tsx`
Expected: FAIL — the module does not exist.

Create `src/features/analytics/charts/TrendChart.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatCount, formatGaDate } from "../analytics-format";
import type { AnalyticsTrendMetric, AnalyticsTrendSeries } from "../types";

/**
 * A dependency-free line chart.
 *
 * `recharts` is on the repo's "stays deleted" list
 * (scripts/test-production-hardening.mjs), and a charting library is a large
 * dependency for two polylines. The SVG is drawn from a fixed `viewBox`, so it
 * needs no layout measurement and renders identically in jsdom and a browser.
 *
 * The picture is decoration: every point is also in the sr-only table, which
 * is the accessible reading of this figure.
 */

const TREND_METRIC_LABELS: Record<AnalyticsTrendMetric, string> = {
  activeUsers: "활성 사용자",
  newUsers: "신규 사용자",
  sessions: "세션",
};

const VIEW_HEIGHT = 256;
const PADDING = { top: 16, right: 12, bottom: 28, left: 52 };

export type TrendChartProps = {
  series: AnalyticsTrendSeries;
  metric: AnalyticsTrendMetric;
  showPrevious: boolean;
  width?: number;
};

export default function TrendChart({
  series,
  metric,
  showPrevious,
  width = 720,
}: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const points = series.points;
  const label = TREND_METRIC_LABELS[metric];

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        표시할 일별 데이터가 없습니다.
      </p>
    );
  }

  const currentValues = points.map((point) => point.current[metric]);
  const previousValues = points.map((point) => point.previous?.[metric] ?? 0);
  const maxValue = Math.max(
    1,
    ...currentValues,
    ...(showPrevious ? previousValues : []),
  );
  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const bandWidth = plotWidth / Math.max(1, points.length);

  const xAt = (index: number) =>
    points.length <= 1
      ? PADDING.left + plotWidth / 2
      : PADDING.left + (index / (points.length - 1)) * plotWidth;
  const yAt = (value: number) =>
    PADDING.top + plotHeight - (value / maxValue) * plotHeight;
  const pathOf = (values: readonly number[]) =>
    values
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`,
      )
      .join(" ");

  const hoveredPoint = hovered === null ? null : points[hovered];

  return (
    <figure aria-label={`일별 추세: ${label}`} className="m-0 space-y-2">
      <svg
        viewBox={`0 0 ${width} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="presentation"
        aria-hidden="true"
        className="h-64 w-full rounded-lg bg-muted/30"
      >
        <line
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={width - PADDING.right}
          y2={PADDING.top + plotHeight}
          className="stroke-border"
          strokeWidth={1}
        />
        <text
          x={PADDING.left - 8}
          y={PADDING.top + 4}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          {formatCount(maxValue)}
        </text>
        <text
          x={PADDING.left - 8}
          y={PADDING.top + plotHeight}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          0
        </text>

        {showPrevious ? (
          <path
            d={pathOf(previousValues)}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        ) : null}
        <path
          d={pathOf(currentValues)}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2}
        />

        {points.map((point, index) => (
          <rect
            key={point.date}
            data-point={index}
            x={xAt(index) - bandWidth / 2}
            y={PADDING.top}
            width={bandWidth}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        <text
          x={PADDING.left}
          y={VIEW_HEIGHT - 8}
          className="fill-muted-foreground text-xs"
        >
          {formatGaDate(points[0]?.date ?? "")}
        </text>
        <text
          x={width - PADDING.right}
          y={VIEW_HEIGHT - 8}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          {formatGaDate(points.at(-1)?.date ?? "")}
        </text>
      </svg>

      {hoveredPoint ? (
        <p
          data-testid="trend-tooltip"
          className="rounded-lg border bg-card px-3 py-2 text-xs tabular-nums text-foreground"
        >
          {formatGaDate(hoveredPoint.date)} · {label}{" "}
          {formatCount(hoveredPoint.current[metric])}
          {showPrevious
            ? ` · 이전 기간 ${
                hoveredPoint.previous
                  ? formatCount(hoveredPoint.previous[metric])
                  : "—"
              }`
            : ""}
        </p>
      ) : null}

      <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
          </svg>
          이번 기간
        </span>
        {showPrevious ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            </svg>
            이전 기간
          </span>
        ) : null}
      </p>

      <table className="sr-only">
        <caption>{`일별 추세: ${label}`}</caption>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">{label}</th>
            {showPrevious ? <th scope="col">이전 기간</th> : null}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{formatGaDate(point.date)}</th>
              <td>{formatCount(point.current[metric])}</td>
              {showPrevious ? (
                <td>
                  {point.previousDate ? `${formatGaDate(point.previousDate)} ` : ""}
                  {point.previous ? formatCount(point.previous[metric]) : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
```

- [ ] **Step 3: Run it and make it pass**

Run: `npx vitest run src/features/analytics/charts/TrendChart.test.tsx`
Expected: PASS

- [ ] **Step 4: Write the failing filter-bar and insights tests**

Create `src/features/analytics/AnalyticsFilterBar.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsFilterBar } from "./AnalyticsFilterBar";
import { ANALYTICS_PLATFORMS, EMPTY_FILTERS } from "./analytics-filters";

afterEach(cleanup);

function renderBar(
  overrides: Partial<React.ComponentProps<typeof AnalyticsFilterBar>> = {},
) {
  const onChange = vi.fn();
  render(
    <AnalyticsFilterBar
      filters={EMPTY_FILTERS}
      onChange={onChange}
      platforms={ANALYTICS_PLATFORMS}
      accountTypeAvailability="available"
      {...overrides}
    />,
  );
  return { onChange };
}

describe("AnalyticsFilterBar", () => {
  it("exposes each platform as a pressed-state toggle", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar();

    const ios = screen.getByRole("button", { name: "iOS" });
    expect(ios).toHaveAttribute("aria-pressed", "false");
    await user.click(ios);

    expect(onChange).toHaveBeenCalledWith({
      platforms: ["iOS"],
      accountType: "all",
    });
    expect(screen.getByRole("group", { name: "보고서 필터" })).toBeInTheDocument();
  });

  it("counts what is applied and offers one reset", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({
      filters: { platforms: ["iOS", "web"], accountType: "business" },
    });

    expect(screen.getByText("필터 3개 적용 중")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "필터 초기화" }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it("explains why the account-type filter is unavailable instead of hiding it", () => {
    renderBar({ accountTypeAvailability: "unavailable" });

    expect(screen.getByLabelText("계정 유형")).toBeDisabled();
    expect(
      screen.getByText(
        "GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("says the realtime report ignores filters rather than silently dropping them", () => {
    renderBar({ disabled: true });

    expect(
      screen.getByText("실시간 보고서에는 필터가 적용되지 않습니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "iOS" })).toBeDisabled();
  });

  it("hides the platform chips for a single-platform property", () => {
    renderBar({ platforms: [] });

    expect(screen.queryByRole("button", { name: "iOS" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("계정 유형")).toBeInTheDocument();
  });
});
```

Create `src/features/analytics/InsightsPanel.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InsightsPanel } from "./InsightsPanel";
import type { AnalyticsInsight } from "./types";

const insight = (
  overrides: Partial<AnalyticsInsight> & Pick<AnalyticsInsight, "id" | "severity" | "text">,
): AnalyticsInsight => ({
  metric: "activeUsers",
  scope: "total",
  delta: -32,
  current: 843,
  previous: 1240,
  ...overrides,
});

afterEach(cleanup);

describe("InsightsPanel", () => {
  it("labels severity in words, not colour alone", () => {
    render(
      <InsightsPanel
        insights={[
          insight({
            id: "total:newUsers",
            severity: "warning",
            text: "신규 사용자 32% 감소 (1,240 → 843)",
          }),
          insight({ id: "total:sessions", severity: "positive", text: "세션 33% 증가 (90 → 120)" }),
          insight({ id: "share:iOS", severity: "info", text: "iOS 비중 38% → 51%" }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "인사이트 요약" })).toBeInTheDocument();
    expect(screen.getByText("주의")).toBeInTheDocument();
    expect(screen.getByText("긍정")).toBeInTheDocument();
    expect(screen.getByText("참고")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("신규 사용자 32% 감소 (1,240 → 843)"),
    ).toBeInTheDocument();
  });

  it("says nothing moved rather than showing an empty list", () => {
    render(<InsightsPanel insights={[]} />);

    expect(
      screen.getByText("이전 기간 대비 눈에 띄는 변화가 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run them, watch them fail, then write both components**

Run: `npx vitest run src/features/analytics/AnalyticsFilterBar.test.tsx src/features/analytics/InsightsPanel.test.tsx`
Expected: FAIL — neither module exists.

Create `src/features/analytics/AnalyticsFilterBar.tsx`:

```tsx
"use client";

import { FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  togglePlatform,
  type AnalyticsAccountType,
  type AnalyticsFilters,
  type AnalyticsPlatform,
} from "./analytics-filters";

const ACCOUNT_TYPE_OPTIONS: Array<{ value: AnalyticsAccountType; label: string }> = [
  { value: "all", label: "전체" },
  { value: "consumer", label: "일반 사용자" },
  { value: "business", label: "업체" },
];

export type AccountTypeAvailability =
  | "pending"
  | "available"
  | "unavailable"
  | "unknown";

export type AnalyticsFilterBarProps = {
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  platforms: readonly AnalyticsPlatform[];
  accountTypeAvailability: AccountTypeAvailability;
  /** Realtime reports take no dimension filter; the bar says so instead of lying. */
  disabled?: boolean;
};

export function AnalyticsFilterBar({
  filters,
  onChange,
  platforms,
  accountTypeAvailability,
  disabled = false,
}: AnalyticsFilterBarProps) {
  const count = activeFilterCount(filters);
  const accountTypeDisabled =
    disabled || accountTypeAvailability !== "available";

  return (
    <div
      role="group"
      aria-label="보고서 필터"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {platforms.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {platforms.map((platform) => {
            const pressed = filters.platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                onClick={() => onChange(togglePlatform(filters, platform))}
                className={cn(
                  "min-h-9 rounded-lg border px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  pressed && "border-primary bg-accent text-accent-foreground",
                )}
              >
                {platform}
              </button>
            );
          })}
        </div>
      ) : null}

      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        계정 유형
        <select
          aria-label="계정 유형"
          className="h-9 min-w-40 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
          value={filters.accountType}
          disabled={accountTypeDisabled}
          onChange={(event) =>
            onChange({
              ...filters,
              accountType: event.target.value as AnalyticsAccountType,
            })
          }
        >
          {ACCOUNT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        {count > 0 ? (
          <p className="text-xs tabular-nums text-muted-foreground">
            필터 {count}개 적용 중
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || count === 0}
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <FilterX aria-hidden="true" /> 필터 초기화
        </Button>
      </div>

      {accountTypeAvailability === "unavailable" ? (
        <p className="basis-full text-xs leading-5 text-muted-foreground">
          GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.
        </p>
      ) : null}
      {disabled ? (
        <p className="basis-full text-xs leading-5 text-muted-foreground">
          실시간 보고서에는 필터가 적용되지 않습니다.
        </p>
      ) : null}
    </div>
  );
}
```

Create `src/features/analytics/InsightsPanel.tsx`:

```tsx
import { Info, TrendingUp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSignificantPercent } from "./analytics-format";
import type { AnalyticsInsight, AnalyticsInsightSeverity } from "./types";

/**
 * Severity is carried by a word as well as a colour and an icon. An operator
 * scanning this list on a projector, or with a colour-vision difference, still
 * reads which line is the alarm.
 */
const SEVERITY: Record<
  AnalyticsInsightSeverity,
  { label: string; icon: typeof Info; className: string }
> = {
  warning: {
    label: "주의",
    icon: TriangleAlert,
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
  },
  positive: {
    label: "긍정",
    icon: TrendingUp,
    className: "border-success/40 bg-success/10 text-success",
  },
  info: {
    label: "참고",
    icon: Info,
    className: "border-info/40 bg-info/10 text-info",
  },
};

const HEADING_ID = "analytics-insights-title";

export function InsightsPanel({ insights }: { insights: AnalyticsInsight[] }) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="rounded-xl border bg-card p-4"
    >
      <h2 id={HEADING_ID} className="font-semibold">
        인사이트 요약
      </h2>
      {insights.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          이전 기간 대비 눈에 띄는 변화가 없습니다.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {insights.map((insight) => {
            const severity = SEVERITY[insight.severity];
            const Icon = severity.icon;
            return (
              <li key={insight.id} className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                    severity.className,
                  )}
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {severity.label}
                </span>
                <span className="text-sm leading-6">{insight.text}</span>
                {insight.delta === null ? null : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {insight.delta < 0 ? "−" : "+"}
                    {formatSignificantPercent(insight.delta)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run them and make them pass**

Run: `npx vitest run src/features/analytics/AnalyticsFilterBar.test.tsx src/features/analytics/InsightsPanel.test.tsx`
Expected: PASS

- [ ] **Step 7: Write the failing funnel and retention panel tests**

Create `src/features/analytics/FunnelPanel.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunnelPanel } from "./FunnelPanel";
import type { AnalyticsFunnelResult, AnalyticsFunnelStepResult } from "./types";

function step(
  index: number,
  name: string,
  users: number,
  shareOfFirst: number,
  rates: Partial<AnalyticsFunnelStepResult> = {},
): AnalyticsFunnelStepResult {
  return {
    index,
    name,
    users,
    completionRate: null,
    abandonments: null,
    abandonmentRate: null,
    shareOfFirst,
    ...rates,
  };
}

function result(overrides: Partial<AnalyticsFunnelResult> = {}): AnalyticsFunnelResult {
  return {
    view: "funnel",
    funnelId: "party-apply",
    title: "파티 신청",
    description: "파티 상세에서 신청 완료까지의 단계별 이탈입니다.",
    steps: [
      step(0, "파티 상세", 1000, 1, {
        completionRate: 0.4,
        abandonments: 600,
        abandonmentRate: 0.6,
      }),
      step(1, "신청 화면", 400, 0.4, {
        completionRate: 0.25,
        abandonments: 300,
        abandonmentRate: 0.75,
      }),
      step(2, "신청 완료", 100, 0.1),
    ],
    breakdown: null,
    currencyCode: "KRW",
    quota: null,
    dataQualityNotices: [],
    isEmpty: false,
    ...overrides,
  };
}

afterEach(cleanup);

function renderPanel(overrides: Partial<React.ComponentProps<typeof FunnelPanel>> = {}) {
  const onFunnelIdChange = vi.fn();
  const onBreakdownChange = vi.fn();
  render(
    <FunnelPanel
      result={result()}
      funnelId="party-apply"
      onFunnelIdChange={onFunnelIdChange}
      breakdown={false}
      onBreakdownChange={onBreakdownChange}
      {...overrides}
    />,
  );
  return { onFunnelIdChange, onBreakdownChange };
}

describe("FunnelPanel", () => {
  it("writes each step's conversion and abandonment as text beside the bar", () => {
    renderPanel();

    expect(screen.getByText("1. 파티 상세")).toBeInTheDocument();
    expect(screen.getByText("1,000명")).toBeInTheDocument();
    expect(screen.getByText(/다음 단계 전환 40\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/이탈 600명 \(60\.0%\)/)).toBeInTheDocument();
    // The last step has no next step, so it claims neither.
    expect(screen.getByText("마지막 단계")).toBeInTheDocument();
  });

  it("switches preset and breakdown through the controls", async () => {
    const user = userEvent.setup();
    const { onFunnelIdChange, onBreakdownChange } = renderPanel();

    await user.selectOptions(screen.getByLabelText("퍼널"), "party-payment");
    expect(onFunnelIdChange).toHaveBeenCalledWith("party-payment");

    await user.click(screen.getByLabelText("플랫폼별 보기"));
    expect(onBreakdownChange).toHaveBeenCalledWith(true);
  });

  it("lists every breakdown value under its step", () => {
    renderPanel({
      breakdown: true,
      result: result({
        breakdown: {
          dimension: "platform",
          rows: [
            {
              value: "iOS",
              steps: [
                step(0, "파티 상세", 600, 1, {
                  completionRate: 0.5,
                  abandonments: 300,
                  abandonmentRate: 0.5,
                }),
                step(1, "신청 화면", 300, 0.5),
                step(2, "신청 완료", 90, 0.15),
              ],
            },
            {
              value: "Android",
              steps: [
                step(0, "파티 상세", 400, 1),
                step(1, "신청 화면", 100, 0.25),
                step(2, "신청 완료", 10, 0.025),
              ],
            },
          ],
        },
      }),
    });

    expect(screen.getAllByText("iOS")).toHaveLength(3);
    expect(screen.getAllByText("Android")).toHaveLength(3);
    expect(screen.getByText("600명")).toBeInTheDocument();
  });

  it("blames the instrumentation, not the product, when step one is empty", () => {
    renderPanel({
      result: result({
        isEmpty: true,
        steps: [
          step(0, "파티 상세", 0, 0),
          step(1, "신청 화면", 0, 0),
          step(2, "신청 완료", 0, 0),
        ],
      }),
    });

    expect(
      screen.getByText(
        "선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을 확인해 주세요.",
      ),
    ).toBeInTheDocument();
  });
});
```

Create `src/features/analytics/RetentionHeatmap.test.tsx`:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RetentionHeatmap } from "./RetentionHeatmap";
import type { AnalyticsRetentionResult } from "./types";

const result: AnalyticsRetentionResult = {
  view: "retention",
  granularity: "WEEKLY",
  horizon: 4,
  cohorts: [
    {
      name: "2026-08-23",
      startDate: "2026-08-23",
      endDate: "2026-08-29",
      totalUsers: 200,
      cells: [
        { week: 0, activeUsers: 200, rate: 1, state: "complete" },
        { week: 1, activeUsers: 90, rate: 0.45, state: "complete" },
        { week: 2, activeUsers: 40, rate: 0.2, state: "complete" },
        { week: 3, activeUsers: 10, rate: 0.05, state: "partial" },
        { week: 4, activeUsers: 0, rate: 0, state: "future" },
      ],
    },
    {
      name: "2026-08-30",
      startDate: "2026-08-30",
      endDate: "2026-09-05",
      totalUsers: 0,
      cells: [
        { week: 0, activeUsers: 0, rate: null, state: "complete" },
        { week: 1, activeUsers: 0, rate: null, state: "partial" },
        { week: 2, activeUsers: 0, rate: null, state: "future" },
        { week: 3, activeUsers: 0, rate: null, state: "future" },
        { week: 4, activeUsers: 0, rate: null, state: "future" },
      ],
    },
  ],
  currencyCode: "KRW",
  quota: null,
  dataQualityNotices: [],
  isEmpty: false,
};

afterEach(cleanup);

describe("RetentionHeatmap", () => {
  it("shows week 1 through 4 with the rate written out, never colour alone", () => {
    render(<RetentionHeatmap result={result} />);

    expect(
      screen.getByText("첫 세션 주 기준 주간 코호트 · GA4 firstSessionDate"),
    ).toBeInTheDocument();
    for (const header of ["코호트 시작일", "크기", "1주", "2주", "3주", "4주"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    // Week 0 stays in the data but not on screen: it is always 100 %.
    expect(screen.queryByRole("columnheader", { name: "0주" })).not.toBeInTheDocument();

    const row = screen.getByRole("row", { name: /2026-08-23/ });
    expect(within(row).getByText("45.0%")).toBeInTheDocument();
    expect(within(row).getByText("5.0%†")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("grades intensity in five steps and marks the unfinished week", () => {
    const { container } = render(<RetentionHeatmap result={result} />);

    const cells = container.querySelectorAll("td[data-intensity]");
    const intensities = [...cells].map((cell) => cell.getAttribute("data-intensity"));
    expect(intensities.slice(0, 4)).toEqual(["4", "2", "1", "0"]);
    expect(cells[2]?.getAttribute("data-state")).toBe("partial");
    expect(screen.getByText("† 아직 끝나지 않은 주")).toBeInTheDocument();
  });

  it("leaves an empty cohort blank rather than drawing it as a total loss", () => {
    render(<RetentionHeatmap result={result} />);

    const row = screen.getByRole("row", { name: /2026-08-30/ });
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(within(row).getByText("0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run them, watch them fail, then write both panels**

Run: `npx vitest run src/features/analytics/FunnelPanel.test.tsx src/features/analytics/RetentionHeatmap.test.tsx`
Expected: FAIL — neither module exists.

Create `src/features/analytics/FunnelPanel.tsx`:

```tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCount, formatRate } from "./analytics-format";
import {
  FUNNEL_DEFINITIONS,
  FUNNEL_IDS,
  type FunnelId,
} from "./funnel-definitions";
import type { AnalyticsFunnelResult, AnalyticsFunnelStepResult } from "./types";

/** The funnel itself is `--chart-1`; breakdown rows cycle through the rest. */
const BREAKDOWN_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export type FunnelPanelProps = {
  result: AnalyticsFunnelResult;
  funnelId: FunnelId;
  onFunnelIdChange: (funnelId: FunnelId) => void;
  breakdown: boolean;
  onBreakdownChange: (breakdown: boolean) => void;
};

export function FunnelPanel({
  result,
  funnelId,
  onFunnelIdChange,
  breakdown,
  onBreakdownChange,
}: FunnelPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{result.title}</CardTitle>
        <CardDescription className="mt-1">{result.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            퍼널
            <select
              aria-label="퍼널"
              className="h-9 min-w-40 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
              value={funnelId}
              onChange={(event) => onFunnelIdChange(event.target.value as FunnelId)}
            >
              {FUNNEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {FUNNEL_DEFINITIONS[id].title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={breakdown}
              onChange={(event) => onBreakdownChange(event.target.checked)}
            />
            플랫폼별 보기
          </label>
        </div>

        {result.isEmpty ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
            선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을
            확인해 주세요.
          </p>
        ) : (
          <ol className="space-y-5">
            {result.steps.map((step) => (
              <li key={step.index} className="space-y-2">
                <FunnelStepRow step={step} color="var(--chart-1)" />
                {result.breakdown ? (
                  <ul className="space-y-2 border-l pl-4">
                    {result.breakdown.rows.map((row, rowIndex) => {
                      const rowStep = row.steps[step.index];
                      if (!rowStep) return null;
                      return (
                        <li key={row.value}>
                          <FunnelStepRow
                            step={rowStep}
                            label={row.value}
                            color={
                              BREAKDOWN_COLORS[rowIndex % BREAKDOWN_COLORS.length]
                            }
                            compact
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelStepRow({
  step,
  color,
  label,
  compact = false,
}: {
  step: AnalyticsFunnelStepResult;
  color: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={compact ? "text-sm text-muted-foreground" : "font-medium"}>
          {label ?? `${step.index + 1}. ${step.name}`}
        </p>
        <p className="text-sm font-medium tabular-nums">
          {formatCount(step.users)}명
        </p>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          aria-hidden="true"
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, step.shareOfFirst * 100)).toFixed(1)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <p className="text-xs leading-5 tabular-nums text-muted-foreground">
        {step.completionRate === null
          ? "마지막 단계"
          : `다음 단계 전환 ${formatRate(step.completionRate)}`}
        {step.abandonments === null
          ? null
          : ` · 이탈 ${formatCount(step.abandonments)}명 (${formatRate(step.abandonmentRate)})`}
      </p>
    </div>
  );
}
```

Create `src/features/analytics/RetentionHeatmap.tsx`:

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatRate } from "./analytics-format";
import type {
  AnalyticsRetentionCell,
  AnalyticsRetentionResult,
} from "./types";

/**
 * Colour grades the cell, the printed rate states it. A heatmap that says
 * "this square is darker" and nothing else is unreadable to a fifth of
 * operators and unquotable in a report by all of them.
 */
const CELL_ALPHA = [0.06, 0.24, 0.42, 0.6, 0.78];

function intensityOf(cell: AnalyticsRetentionCell | undefined): number {
  if (!cell || cell.state === "future" || cell.rate === null) return 0;
  if (cell.rate >= 0.4) return 4;
  if (cell.rate >= 0.25) return 3;
  if (cell.rate >= 0.15) return 2;
  if (cell.rate >= 0.05) return 1;
  return 0;
}

function cellText(cell: AnalyticsRetentionCell | undefined): string {
  if (!cell || cell.state === "future" || cell.rate === null) return "—";
  return `${formatRate(cell.rate)}${cell.state === "partial" ? "†" : ""}`;
}

export function RetentionHeatmap({
  result,
}: {
  result: AnalyticsRetentionResult;
}) {
  // Week 0 is every cohort's own definition — always 100 %. It stays in the
  // data (the API returned it) but adding a column of "100.0%" teaches nothing.
  const weeks = Array.from({ length: result.horizon }, (_unused, i) => i + 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>주간 코호트 리텐션</CardTitle>
        <CardDescription className="mt-1">
          첫 세션 주 기준 주간 코호트 · GA4 firstSessionDate
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">주간 코호트 리텐션</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>코호트 시작일</TableHead>
                <TableHead className="text-right">크기</TableHead>
                {weeks.map((week) => (
                  <TableHead key={week} className="text-right">
                    {week}주
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.cohorts.map((cohort) => (
                <TableRow key={cohort.name}>
                  <TableCell className="tabular-nums">{cohort.startDate}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCount(cohort.totalUsers)}
                  </TableCell>
                  {weeks.map((week) => {
                    const cell = cohort.cells.find((entry) => entry.week === week);
                    const intensity = intensityOf(cell);
                    return (
                      <TableCell
                        key={week}
                        data-intensity={intensity}
                        data-state={cell?.state ?? "future"}
                        style={
                          {
                            "--cell-alpha": CELL_ALPHA[intensity],
                          } as React.CSSProperties
                        }
                        className="bg-[color-mix(in_oklch,var(--chart-1)_calc(var(--cell-alpha)*100%),transparent)] text-right tabular-nums"
                      >
                        {cellText(cell)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            낮음
            {CELL_ALPHA.map((alpha) => (
              <span
                key={alpha}
                aria-hidden="true"
                style={{ "--cell-alpha": alpha } as React.CSSProperties}
                className="inline-block size-3 rounded-sm border bg-[color-mix(in_oklch,var(--chart-1)_calc(var(--cell-alpha)*100%),transparent)]"
              />
            ))}
            높음
          </span>
          <span>† 아직 끝나지 않은 주</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

> **If the OpenNext build reports the `bg-[color-mix(...)]` utility as missing**, Tailwind's scanner did not accept the arbitrary value. Replace the class with `style={{ backgroundColor: \`color-mix(in oklch, var(--chart-1) ${CELL_ALPHA[intensity] * 100}%, transparent)\` }}` on the same elements. Both forms use only `--chart-1`, so either satisfies the token rule; do not reach for a raw palette colour.

- [ ] **Step 9: Run them and make them pass**

Run: `npx vitest run src/features/analytics/FunnelPanel.test.tsx src/features/analytics/RetentionHeatmap.test.tsx`
Expected: PASS

- [ ] **Step 10: Widen the query keys and the quota UI**

Replace `report` in `src/features/analytics/analytics-query-keys.ts` and add `capabilities`:

```ts
  /**
   * `filters` and `variant` are separate segments so a filter change is a new
   * cache entry (and `keepPreviousData` can hold the old table on screen)
   * while the view/range/property prefix stays intact for invalidation.
   * `variant` carries the funnel preset and breakdown; other views pass "".
   */
  report: (
    generation: number,
    propertyId: string,
    view: AnalyticsReportView,
    range: AnalyticsDateRange,
    filters: string,
    variant: string,
  ) =>
    [
      "google-analytics",
      generation,
      propertyId,
      view,
      range,
      filters,
      variant,
    ] as const,
  capabilities: (generation: number, propertyId: string) =>
    ["google-analytics", generation, propertyId, "capabilities"] as const,
```

In `src/features/analytics/AnalyticsStates.tsx`, add the import

```ts
import { QUOTA_POOL_LABELS, quotaPressure } from "./analytics-quota";
```

change `QuotaFooter`'s summary line (line 205) to

```tsx
        <summary className="cursor-pointer font-medium text-foreground">
          GA API 할당량 상태 · {QUOTA_POOL_LABELS[quota.category]}
        </summary>
```

and append:

```tsx
/**
 * Named on purpose: Core, Realtime and Funnel are separate pools. "할당량 소진"
 * with no pool named makes an operator stop using a screen that still works.
 */
export function QuotaBanner({ quota }: { quota: AnalyticsQuotaState | null }) {
  const pressure = quotaPressure(quota);
  if (pressure.level === "ok") return null;
  const scope = pressure.scope === "day" ? "일일" : "시간당";

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-warning-foreground"
        aria-hidden="true"
      />
      <p className="leading-6">
        {pressure.level === "exhausted"
          ? "GA API 할당량을 모두 사용했습니다. 퍼널·리텐션은 토큰을 많이 소비합니다."
          : `GA API ${scope} 할당량이 10% 미만입니다. 퍼널·리텐션은 토큰을 많이 소비합니다.`}
      </p>
    </div>
  );
}
```

- [ ] **Step 11: Write the failing dashboard tests**

In `src/features/analytics/AnalyticsDashboard.test.tsx`, replace the `analytics-reports` mock (lines 22–24) with

```tsx
vi.mock("./analytics-reports", () => ({
  fetchAnalyticsReport: vi.fn(),
  fetchAnalyticsCapabilities: vi.fn(),
}));

vi.mock("./charts/TrendChart", () => ({
  default: ({
    metric,
    showPrevious,
  }: {
    metric: string;
    showPrevious: boolean;
  }) => (
    <div
      data-testid="trend-chart"
      data-metric={metric}
      data-show-previous={String(showPrevious)}
    />
  ),
}));
```

widen its import (line 30) to

```tsx
import {
  fetchAnalyticsCapabilities,
  fetchAnalyticsReport,
} from "./analytics-reports";
```

replace `emptyOverview` (lines 38–48) with

```tsx
function emptyOverview(): AnalyticsReportResult {
  return {
    view: "overview",
    metrics: [],
    series: { points: [] },
    platforms: [],
    insights: [],
    currencyCode: "KRW",
    quota: null,
    dataQualityNotices: [],
    isEmpty: true,
  };
}
```

and extend `beforeEach` (lines 67–72) with

```tsx
    vi.mocked(fetchAnalyticsCapabilities).mockReset();
    vi.mocked(fetchAnalyticsCapabilities).mockResolvedValue({
      accountTypeDimension: true,
      customDimensions: ["customUser:account_type"],
    });
```

Replace the test "labels the overview visualization as a session-only daily trend" (lines 211–228) with:

```tsx
  it("draws the selected trend metric and compares the previous period on request", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      view: "overview",
      metrics: [
        { key: "sessions", label: "세션", value: 15, previousValue: 12, format: "integer" },
      ],
      series: {
        points: [
          {
            date: "20260830",
            previousDate: "20260802",
            current: { activeUsers: 12, newUsers: 4, sessions: 15 },
            previous: { activeUsers: 9, newUsers: 3, sessions: 11 },
          },
        ],
      },
      platforms: [],
      insights: [
        {
          id: "total:sessions",
          severity: "positive",
          text: "세션 25% 증가 (12 → 15)",
          metric: "sessions",
          scope: "total",
          delta: 25,
          current: 15,
          previous: 12,
        },
      ],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: false,
    });
    renderDashboard();

    const chart = await screen.findByTestId("trend-chart");
    expect(chart).toHaveAttribute("data-metric", "activeUsers");
    expect(chart).toHaveAttribute("data-show-previous", "true");
    expect(screen.getByRole("heading", { name: "인사이트 요약" })).toBeInTheDocument();
    expect(screen.getByText("세션 25% 증가 (12 → 15)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "신규 사용자" }));
    expect(await screen.findByTestId("trend-chart")).toHaveAttribute(
      "data-metric",
      "newUsers",
    );

    await user.click(screen.getByLabelText("이전 기간 비교"));
    expect(await screen.findByTestId("trend-chart")).toHaveAttribute(
      "data-show-previous",
      "false",
    );
  });
```

Append these five `it` blocks at the end of the `describe`:

```tsx
  it("adds funnel and retention tabs that fetch their own views", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockImplementation(async ({ view }) => {
      if (view === "funnel") {
        return {
          view: "funnel",
          funnelId: "party-apply",
          title: "파티 신청",
          description: "파티 상세에서 신청 완료까지의 단계별 이탈입니다.",
          steps: [
            {
              index: 0,
              name: "파티 상세",
              users: 1000,
              completionRate: 0.4,
              abandonments: 600,
              abandonmentRate: 0.6,
              shareOfFirst: 1,
            },
            {
              index: 1,
              name: "신청 화면",
              users: 400,
              completionRate: null,
              abandonments: null,
              abandonmentRate: null,
              shareOfFirst: 0.4,
            },
          ],
          breakdown: null,
          currencyCode: "KRW",
          quota: null,
          dataQualityNotices: [],
          isEmpty: false,
        };
      }
      if (view === "retention") {
        return {
          view: "retention",
          granularity: "WEEKLY",
          horizon: 4,
          cohorts: [
            {
              name: "2026-08-30",
              startDate: "2026-08-30",
              endDate: "2026-09-05",
              totalUsers: 120,
              cells: [
                { week: 0, activeUsers: 120, rate: 1, state: "complete" },
                { week: 1, activeUsers: 30, rate: 0.25, state: "partial" },
                { week: 2, activeUsers: 0, rate: 0, state: "future" },
                { week: 3, activeUsers: 0, rate: 0, state: "future" },
                { week: 4, activeUsers: 0, rate: 0, state: "future" },
              ],
            },
          ],
          currencyCode: "KRW",
          quota: null,
          dataQualityNotices: [],
          isEmpty: false,
        };
      }
      return emptyOverview();
    });
    renderDashboard();

    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");

    await user.click(screen.getByRole("button", { name: "퍼널" }));
    expect(await screen.findByLabelText("퍼널")).toBeInTheDocument();
    expect(screen.getByText("1. 파티 상세")).toBeInTheDocument();
    expect(fetchAnalyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({ view: "funnel", funnelId: "party-apply" }),
    );

    await user.click(screen.getByRole("button", { name: "리텐션" }));
    expect(
      await screen.findByRole("columnheader", { name: "코호트 시작일" }),
    ).toBeInTheDocument();
    expect(fetchAnalyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({ view: "retention" }),
    );
  });

  it("fixes the retention window and says so instead of offering a dead selector", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      view: "retention",
      granularity: "WEEKLY",
      horizon: 4,
      cohorts: [],
      currencyCode: "KRW",
      quota: null,
      dataQualityNotices: [],
      isEmpty: true,
    });
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "리텐션" }));

    expect(await screen.findByText("리텐션은 최근 6주 코호트 고정")).toBeInTheDocument();
    expect(screen.getByLabelText("비교 기간")).toBeDisabled();
  });

  it("threads a platform chip into the report request and keeps the old table visible", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    // The first property is web-only, so it offers no platform chips.
    await screen.findByText("선택한 기간에 수집된 데이터가 없습니다.");
    expect(screen.queryByRole("button", { name: "iOS" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("GA4 속성"), "5678");
    await user.click(await screen.findByRole("button", { name: "iOS" }));

    expect(fetchAnalyticsReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: { platforms: ["iOS"], accountType: "all" },
      }),
    );
    expect(screen.getByText("필터 1개 적용 중")).toBeInTheDocument();
  });

  it("disables the account-type filter and names the missing custom definition", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsCapabilities).mockResolvedValue({
      accountTypeDimension: false,
      customDimensions: [],
    });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    renderDashboard();

    expect(
      await screen.findByText(
        "GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("계정 유형")).toBeDisabled();
  });

  it("warns above the tabs once the hourly pool drops below a tenth", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue({
      ...emptyOverview(),
      quota: {
        category: "core",
        entries: [{ key: "tokensPerHour", consumed: 39_000, remaining: 1_000 }],
      },
    });
    renderDashboard();

    expect(
      await screen.findByText(
        "GA API 시간당 할당량이 10% 미만입니다. 퍼널·리텐션은 토큰을 많이 소비합니다.",
      ),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 12: Run the dashboard test and watch it fail**

Run: `npx vitest run src/features/analytics/AnalyticsDashboard.test.tsx`
Expected: FAIL — no 퍼널/리텐션 tabs, no filter bar, no trend chart, no insights, no quota banner.

- [ ] **Step 13: Wire the dashboard**

In `src/features/analytics/AnalyticsDashboard.tsx`:

(a) Imports — add to the React Query import `keepPreviousData`, and add:

```ts
import { createRetryableLazyComponent } from "@/components/performance/RetryableLazyComponent";
import { AnalyticsFilterBar, type AccountTypeAvailability } from "./AnalyticsFilterBar";
import { FunnelPanel } from "./FunnelPanel";
import { InsightsPanel } from "./InsightsPanel";
import { RetentionHeatmap } from "./RetentionHeatmap";
import {
  EMPTY_FILTERS,
  availablePlatforms,
  filtersKey,
  type AnalyticsFilters,
} from "./analytics-filters";
import { FUNNEL_IDS, type FunnelId } from "./funnel-definitions";
import {
  fetchAnalyticsCapabilities,
  fetchAnalyticsReport,
  type AnalyticsCapabilities,
} from "./analytics-reports";
import type { TrendChartProps } from "./charts/TrendChart";
import type {
  AnalyticsQuotaCategory,
  AnalyticsQuotaState,
  AnalyticsTrendMetric,
  AnalyticsTrendSeries,
} from "./types";
```

Add `QuotaBanner` to the file's **existing** `./AnalyticsStates` import (lines 43–42 currently bring in `AnalyticsErrorState`, `ConnectionFact`, `DataQualityPanel`, `QuotaFooter`, `StatusCard`) rather than opening a second import from the same module.

`TrendChartProps` is a **type-only** import; the component itself is only ever reached through the dynamic `import()` below, which is what keeps it out of the analytics route's first chunk.

(b) Module constants — add beside `VIEW_OPTIONS`/`DATE_RANGE_OPTIONS`:

```ts
const VIEW_OPTIONS: Array<{ value: AnalyticsReportView; label: string }> = [
  { value: "overview", label: "개요" },
  { value: "acquisition", label: "유입" },
  { value: "engagement", label: "참여" },
  { value: "conversion-revenue", label: "전환·매출" },
  { value: "funnel", label: "퍼널" },
  { value: "retention", label: "리텐션" },
  { value: "realtime", label: "실시간" },
];

/** Which GA4 token pool each view spends. Exhausting one leaves the others alive. */
const VIEW_POOLS: Record<AnalyticsReportView, AnalyticsQuotaCategory> = {
  overview: "core",
  acquisition: "core",
  engagement: "core",
  "conversion-revenue": "core",
  funnel: "funnel",
  retention: "core",
  realtime: "realtime",
};

const STALE_TIMES: Record<AnalyticsReportView, number> = {
  overview: 5 * 60_000,
  acquisition: 5 * 60_000,
  engagement: 5 * 60_000,
  "conversion-revenue": 5 * 60_000,
  // Funnel and cohort reports are the expensive ones; 15 minutes keeps a tab
  // switch from spending the pool again.
  funnel: 15 * 60_000,
  retention: 15 * 60_000,
  realtime: 60_000,
};

const TREND_METRIC_OPTIONS: Array<{
  value: AnalyticsTrendMetric;
  label: string;
}> = [
  { value: "activeUsers", label: "활성 사용자" },
  { value: "newUsers", label: "신규 사용자" },
  { value: "sessions", label: "세션" },
];

const EMPTY_DESCRIPTIONS: Record<AnalyticsReportView, string> = {
  overview:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
  acquisition:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
  engagement:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
  "conversion-revenue":
    "GA4에서 구매·주요 이벤트 값이 확인되지 않습니다. 이벤트 수집과 주요 이벤트 정의 여부를 별도로 확인해 주세요.",
  funnel:
    "선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을 확인해 주세요.",
  retention:
    "최근 6주 코호트에서 첫 세션 사용자가 확인되지 않습니다. 코호트 기간은 기간 선택과 무관하게 고정입니다.",
  realtime:
    "속성, 기간과 GA4 데이터 수집 상태를 확인해 주세요. 값이 없을 때 임의의 0으로 보정하지 않습니다.",
};

/**
 * The chart never enters the analytics route's first chunk. Asserted by
 * scripts/test-admin-ui-foundation.mjs: the dashboard may name its props type,
 * but the component itself arrives only through this dynamic import.
 */
const LazyTrendChart = createRetryableLazyComponent<TrendChartProps>(
  () => import("./charts/TrendChart"),
  {
    loading: (
      <div
        className="h-64 animate-pulse rounded-lg bg-muted/50"
        aria-hidden="true"
      />
    ),
    errorTitle: "추세 차트를 불러오지 못했습니다.",
  },
);
```

(c) `AnalyticsDashboard` body — add state, the capabilities query and the reset effect immediately after the existing `useState` calls (lines 86–88), **before** the two early returns:

```tsx
  const [filters, setFilters] = useState<AnalyticsFilters>(EMPTY_FILTERS);
  const [funnelId, setFunnelId] = useState<FunnelId>(FUNNEL_IDS[0]);
  const [funnelBreakdown, setFunnelBreakdown] = useState(false);
  const [trendMetric, setTrendMetric] =
    useState<AnalyticsTrendMetric>("activeUsers");
  const [showPrevious, setShowPrevious] = useState(true);
  const [latestQuota, setLatestQuota] = useState<AnalyticsQuotaState | null>(null);
  const [exhaustedPools, setExhaustedPools] = useState<AnalyticsQuotaCategory[]>(
    [],
  );

  const selectedProperty =
    properties.find((property) => property.id === propertyId) ?? properties[0];

  // A quota reading and a filter selection belong to one property. Carrying
  // them across would put another property's numbers behind this one's banner.
  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setLatestQuota(null);
    setExhaustedPools([]);
  }, [selectedProperty?.id]);

  const capabilities = useQuery<AnalyticsCapabilities, Error>({
    queryKey: analyticsQueryKeys.capabilities(
      token.generation,
      selectedProperty?.id ?? "",
    ),
    queryFn: ({ signal }) => {
      const accessToken = getAnalyticsAccessToken();
      if (!accessToken || !selectedProperty) {
        throw new AnalyticsDataApiError(
          "expired",
          "Google Analytics 연결이 만료되었습니다.",
        );
      }
      return fetchAnalyticsCapabilities({
        propertyId: selectedProperty.id,
        accessToken,
        signal,
      });
    },
    enabled: token.status === "connected" && Boolean(selectedProperty),
    // A property's custom definitions do not change while a tab is open, and a
    // failed metadata read must never block the reports.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const handleQuotaError = useCallback((pool: AnalyticsQuotaCategory) => {
    setExhaustedPools((current) =>
      current.includes(pool) ? current : [...current, pool],
    );
  }, []);

  const accountTypeAvailability: AccountTypeAvailability = capabilities.isPending
    ? "pending"
    : capabilities.isError
      ? "unknown"
      : capabilities.data?.accountTypeDimension
        ? "available"
        : "unavailable";
```

Delete the old `const selectedProperty = …` line (90–91) since it moved above the effect, and add `useCallback` to the React import.

(d) Controls — in the returned JSX, replace the whole `비교 기간` `<label>` (lines 169–183) with the block below. The hint lives **outside** the `<label>`: putting it inside would make the select's accessible name "비교 기간리텐션은 최근 6주 코호트 고정" and break `getByLabelText("비교 기간")`.

```tsx
          <div className="grid min-w-0 gap-1.5">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              비교 기간
              <select
                className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
                value={range}
                onChange={(event) => setRange(event.target.value as AnalyticsDateRange)}
                disabled={view === "realtime" || view === "retention"}
              >
                {DATE_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {view === "retention" ? (
              <p className="text-xs text-muted-foreground">
                리텐션은 최근 6주 코호트 고정
              </p>
            ) : null}
          </div>
```

Directly after that toolbar `<div>`, and before the tab group:

```tsx
      <AnalyticsFilterBar
        filters={filters}
        onChange={setFilters}
        platforms={availablePlatforms(selectedProperty.platform)}
        accountTypeAvailability={accountTypeAvailability}
        disabled={view === "realtime"}
      />

      <QuotaBanner quota={latestQuota} />
```

and in the tab loop add:

```tsx
            disabled={
              view !== option.value &&
              exhaustedPools.includes(VIEW_POOLS[option.value])
            }
            className={cn(
              "min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              view === option.value && "bg-background text-foreground shadow-sm",
            )}
```

(e) Pass everything to `AnalyticsQueryView`, keeping filters out of the React `key`:

```tsx
      <AnalyticsQueryView
        key={`${selectedProperty.id}:${view}:${range}:${token.generation}`}
        property={selectedProperty}
        view={view}
        range={range}
        generation={token.generation}
        filters={filters}
        funnelId={funnelId}
        funnelBreakdown={funnelBreakdown}
        trendMetric={trendMetric}
        showPrevious={showPrevious}
        onFunnelIdChange={setFunnelId}
        onFunnelBreakdownChange={setFunnelBreakdown}
        onTrendMetricChange={setTrendMetric}
        onShowPreviousChange={setShowPrevious}
        onQuota={setLatestQuota}
        onQuotaError={handleQuotaError}
      />
```

The `key` deliberately omits `filters` and the funnel variant: remounting on a filter change would drop the previous table and flash a skeleton. Remounting on view/range/property is what makes `keepPreviousData` scoped to filters only.

- [ ] **Step 14: Rewrite `AnalyticsQueryView` and the content switch**

Replace `AnalyticsQueryView` (lines 244–328) with:

```tsx
type AnalyticsViewControls = {
  funnelId: FunnelId;
  funnelBreakdown: boolean;
  trendMetric: AnalyticsTrendMetric;
  showPrevious: boolean;
  onFunnelIdChange: (funnelId: FunnelId) => void;
  onFunnelBreakdownChange: (breakdown: boolean) => void;
  onTrendMetricChange: (metric: AnalyticsTrendMetric) => void;
  onShowPreviousChange: (showPrevious: boolean) => void;
};

function AnalyticsQueryView({
  property,
  view,
  range,
  generation,
  filters,
  onQuota,
  onQuotaError,
  ...controls
}: AnalyticsViewControls & {
  property: AnalyticsPropertyConfig;
  view: AnalyticsReportView;
  range: AnalyticsDateRange;
  generation: number;
  filters: AnalyticsFilters;
  onQuota: (quota: AnalyticsQuotaState | null) => void;
  onQuotaError: (pool: AnalyticsQuotaCategory) => void;
}) {
  const query = useQuery<AnalyticsReportResult, Error>({
    queryKey: analyticsQueryKeys.report(
      generation,
      property.id,
      view,
      range,
      filtersKey(filters),
      view === "funnel"
        ? `${controls.funnelId}:${controls.funnelBreakdown}`
        : "",
    ),
    queryFn: ({ signal }) => {
      const accessToken = getAnalyticsAccessToken();
      if (!accessToken) {
        throw new AnalyticsDataApiError(
          "expired",
          "Google Analytics 연결이 만료되었습니다.",
        );
      }
      return fetchAnalyticsReport({
        property,
        view,
        range,
        filters,
        funnelId: controls.funnelId,
        funnelBreakdown: controls.funnelBreakdown,
        accessToken,
        signal,
      });
    },
    // Keeps the table an operator is reading on screen while a filter applies.
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES[view],
    gcTime: STALE_TIMES[view],
    refetchInterval: view === "realtime" ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const completionAnnouncedRef = useRef(false);
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");

  useEffect(() => {
    if (!(query.error instanceof AnalyticsDataApiError)) return;
    if (query.error.kind === "expired") clearAnalyticsAccessToken("expired");
    // Only an actual refusal closes a tab — never a low reading.
    if (query.error.kind === "quota") onQuotaError(VIEW_POOLS[view]);
  }, [onQuotaError, query.error, view]);

  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return;
    onQuota(query.data.quota);
  }, [onQuota, query.data, query.isPlaceholderData]);

  useEffect(() => {
    if (!query.data || query.isPlaceholderData || completionAnnouncedRef.current) {
      return;
    }
    completionAnnouncedRef.current = true;
    setCompletionAnnouncement(reportCompletionSummary(property.label, query.data));
  }, [property.label, query.data, query.isPlaceholderData]);

  let content: React.ReactNode;
  if (query.isPending) {
    content = <AnalyticsLoadingState />;
  } else if (query.isError) {
    content = (
      <AnalyticsErrorState error={query.error} retry={() => void query.refetch()} />
    );
  } else if (query.data.isEmpty && query.data.view !== "funnel") {
    // The funnel keeps its own panel even when empty: its preset selector is
    // the only way back to a funnel that does have data.
    const subjectToThresholding = query.data.dataQualityNotices.some(
      (notice) => notice.kind === "thresholding",
    );
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={query.data.dataQualityNotices} />
        <AnalyticsEmptyState
          view={view}
          subjectToThresholding={subjectToThresholding}
        />
        <QuotaFooter quota={query.data.quota} />
      </div>
    );
  } else {
    content = <AnalyticsReportContent result={query.data} {...controls} />;
  }

  return (
    <>
      {!query.isError ? (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={
            query.isPending || query.isPlaceholderData ? "true" : undefined
          }
          aria-label={
            query.isPending
              ? "Google Analytics 보고서 로딩 중"
              : query.isPlaceholderData
                ? "필터 적용 중"
                : undefined
          }
        >
          {query.isPending
            ? "Google Analytics 보고서를 불러오는 중입니다."
            : query.isPlaceholderData
              ? "필터 적용 중입니다. 이전 결과를 표시하고 있습니다."
              : completionAnnouncement}
        </p>
      ) : null}
      {content}
    </>
  );
}
```

Replace `reportCompletionSummary` (lines 349–364):

```tsx
function reportCompletionSummary(
  propertyLabel: string,
  result: AnalyticsReportResult,
): string {
  const viewLabel =
    VIEW_OPTIONS.find((option) => option.value === result.view)?.label ?? "분석";
  const prefix = `${propertyLabel} ${viewLabel} 보고서를 불러왔습니다.`;

  if (result.isEmpty) return `${prefix} 표시할 데이터가 없습니다.`;
  if (result.view === "overview") {
    return `${prefix} 핵심 지표 ${result.metrics.length}개, 일별 데이터 ${result.series.points.length}개가 표시됩니다.`;
  }
  if (result.view === "funnel") {
    return `${prefix} 단계 ${result.steps.length}개, 1단계 사용자 ${formatCount(
      result.steps[0]?.users ?? 0,
    )}명이 표시됩니다.`;
  }
  if (result.view === "retention") {
    return `${prefix} 코호트 ${result.cohorts.length}개가 표시됩니다.`;
  }

  const rowCount = result.tables.reduce((total, table) => total + table.rows.length, 0);
  return `${prefix} 표 ${result.tables.length}개, 행 ${rowCount}개가 표시됩니다.`;
}
```

(add `formatCount` to the `./analytics-format` import), and replace `AnalyticsEmptyState`'s description (lines 385–391) with:

```tsx
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {subjectToThresholding
            ? "GA4 개인정보 보호 임계값으로 일부 데이터가 보고서에 표시되지 않을 수 있습니다. 위 데이터 품질 안내를 함께 확인해 주세요."
            : EMPTY_DESCRIPTIONS[view]}
        </p>
```

(the `conversion` local at line 373 becomes unused — delete it).

- [ ] **Step 15: Replace the content switch and `TrendPanel`**

Replace `AnalyticsReportContent` (lines 397–414) and `TrendPanel` (452–491):

```tsx
function AnalyticsReportContent({
  result,
  funnelId,
  funnelBreakdown,
  trendMetric,
  showPrevious,
  onFunnelIdChange,
  onFunnelBreakdownChange,
  onTrendMetricChange,
  onShowPreviousChange,
}: AnalyticsViewControls & { result: AnalyticsReportResult }) {
  return (
    <div className="space-y-4">
      <DataQualityPanel notices={result.dataQualityNotices} />
      {result.view === "overview" ? (
        <>
          {result.metrics.length > 0 ? (
            <MetricGrid metrics={result.metrics} currencyCode={result.currencyCode} />
          ) : null}
          <InsightsPanel insights={result.insights} />
          <TrendPanel
            series={result.series}
            metric={trendMetric}
            onMetricChange={onTrendMetricChange}
            showPrevious={showPrevious}
            onShowPreviousChange={onShowPreviousChange}
          />
        </>
      ) : result.view === "funnel" ? (
        <FunnelPanel
          result={result}
          funnelId={funnelId}
          onFunnelIdChange={onFunnelIdChange}
          breakdown={funnelBreakdown}
          onBreakdownChange={onFunnelBreakdownChange}
        />
      ) : result.view === "retention" ? (
        <RetentionHeatmap result={result} />
      ) : (
        <>
          {result.metrics.length > 0 ? (
            <MetricGrid metrics={result.metrics} currencyCode={result.currencyCode} />
          ) : null}
          {result.tables.map((table) => (
            <AnalyticsTable
              key={table.key}
              table={table}
              currencyCode={result.currencyCode}
            />
          ))}
        </>
      )}
      <QuotaFooter quota={result.quota} />
    </div>
  );
}

function TrendPanel({
  series,
  metric,
  onMetricChange,
  showPrevious,
  onShowPreviousChange,
}: {
  series: AnalyticsTrendSeries;
  metric: AnalyticsTrendMetric;
  onMetricChange: (metric: AnalyticsTrendMetric) => void;
  showPrevious: boolean;
  onShowPreviousChange: (showPrevious: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>일별 추세</CardTitle>
        <CardDescription>
          선택한 지표의 일별 변화입니다. 이전 기간은 같은 길이의 직전 구간입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="추세 지표"
            className="flex gap-1 rounded-lg border bg-muted/40 p-1"
          >
            {TREND_METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={metric === option.value}
                onClick={() => onMetricChange(option.value)}
                className={cn(
                  "min-h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  metric === option.value && "bg-background text-foreground shadow-sm",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={showPrevious}
              onChange={(event) => onShowPreviousChange(event.target.checked)}
            />
            이전 기간 비교
          </label>
        </div>
        <LazyTrendChart
          series={series}
          metric={metric}
          showPrevious={showPrevious}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 16: Run the dashboard test and make it pass**

Run: `npx vitest run src/features/analytics/AnalyticsDashboard.test.tsx`
Expected: PASS

- [ ] **Step 17: Run the whole suite and type-check**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: PASS and no errors.

- [ ] **Step 18: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics
git rev-parse --abbrev-ref HEAD   # must print feat/analytics-analysis
git add src/features/analytics/charts src/features/analytics/AnalyticsFilterBar.tsx \
  src/features/analytics/AnalyticsFilterBar.test.tsx src/features/analytics/InsightsPanel.tsx \
  src/features/analytics/InsightsPanel.test.tsx src/features/analytics/FunnelPanel.tsx \
  src/features/analytics/FunnelPanel.test.tsx src/features/analytics/RetentionHeatmap.tsx \
  src/features/analytics/RetentionHeatmap.test.tsx src/features/analytics/analytics-query-keys.ts \
  src/features/analytics/AnalyticsStates.tsx src/features/analytics/AnalyticsDashboard.tsx \
  src/features/analytics/AnalyticsDashboard.test.tsx
git commit -m "$(cat <<'MSG'
feat(analytics): funnel, retention and trend UI with filters and insight summary

The daily trend becomes a real line chart: hand-written SVG on a fixed viewBox,
no charting dependency (recharts is on the repo's stays-deleted list), lazily
loaded so it never enters the analytics route's first chunk, with every point
also present in an sr-only table.

Two new tabs. The funnel keeps its preset selector even when a step is empty,
because that selector is the only way to a funnel that has data. The retention
heatmap prints the rate in every cell and marks the still-running week, so the
colour is a grade and never the message.

Filters thread into the query key but not the React key, so applying one keeps
the table on screen with aria-busy rather than flashing a skeleton. The quota
banner names the pool that is low; a tab closes only after that pool actually
refuses a request.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 5: Docs, chart tokens, release contract, full verify

**Files:**
- Modify: `scripts/test-admin-ui-foundation.mjs` (one new test; two existing tests extended)
- Modify: `docs/OPERATIONS.md` (GA4 section — new views plus a setup checklist)
- Modify: `docs/design/design-tokens.json` (mirror `--chart-1` … `--chart-5` for both themes)
- Create: `docs/tasks/2026-09-08-ga4-funnel-retention-trends-insights.md`

**Interfaces:**
- Consumes: everything Tasks 1–4 produced. This task adds no runtime code.
- Produces: the release contract that keeps the chart out of the analytics route's first chunk, and the operator documentation the funnel and retention views depend on.

Read first: `scripts/test-admin-ui-foundation.mjs:62-74` (the design-token test to extend), `:307-317` (the GA4 documentation test to extend), `:448-476` (the user-detail lazy-loading contract, the pattern the new test follows), and `docs/OPERATIONS.md:88-121` (the GA4 section being extended).

- [ ] **Step 1: Write the failing release contract**

Append to `scripts/test-admin-ui-foundation.mjs`:

```js
test("the analytics dashboard keeps the chart module out of its first chunk", async () => {
  const [dashboard, chart] = await Promise.all([
    readFile(
      new URL("src/features/analytics/AnalyticsDashboard.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("src/features/analytics/charts/TrendChart.tsx", root),
      "utf8",
    ),
  ]);

  assert.match(
    dashboard,
    /createRetryableLazyComponent<TrendChartProps>\(\s*\(\)\s*=>\s*import\("\.\/charts\/TrendChart"\)/,
  );
  // `import type` is erased at build time and pulls no chunk; a value import
  // would drag the whole chart into the analytics route's first payload.
  assert.doesNotMatch(
    dashboard,
    /^import\s+(?!type\b)[^\n]*from\s+["']\.\/charts\/TrendChart["']/m,
  );
  assert.match(
    dashboard,
    /import type \{ TrendChartProps \} from ["']\.\/charts\/TrendChart["']/,
  );

  // The chart is hand-written SVG. test-production-hardening.mjs keeps
  // recharts out of dependencies; this keeps a substitute out too.
  assert.match(chart, /<svg/);
  assert.doesNotMatch(
    chart,
    /from\s+["'](?:recharts|d3|d3-[a-z]+|victory|@visx\/[a-z]+|chart\.js)["']/,
  );
});
```

Extend the existing "portable design tokens mirror both runtime themes and density foundations" test (line 62) with:

```js
  assert.equal(tokens.color.light.chart["1"].$value, "oklch(0.55 0.19 295)");
  assert.equal(tokens.color.dark.chart["1"].$value, "oklch(0.72 0.145 295)");
  assert.equal(Object.keys(tokens.color.light.chart).length, 5);
  assert.equal(Object.keys(tokens.color.dark.chart).length, 5);
```

Extend the existing "GA4 reporting setup is documented as public build configuration" test (line 307) with:

```js
  assert.match(operations, /runFunnelReport/);
  assert.match(operations, /firstSessionDate/);
  assert.match(operations, /account_type/);
```

- [ ] **Step 2: Run the release contracts and watch them fail**

Run: `node --test scripts/test-admin-ui-foundation.mjs`
Expected: FAIL — `tokens.color.light.chart` is undefined and `docs/OPERATIONS.md` mentions none of the three new terms. (The chart-chunk test should already pass from Task 4; if it does not, fix `AnalyticsDashboard.tsx` rather than the assertion.)

- [ ] **Step 3: Mirror the chart tokens**

In `docs/design/design-tokens.json`, add a `chart` group inside `color.light` (after `focus`, before `semantic`) copying `src/app/globals.css:98-102`:

```json
      "chart": {
        "1": { "$value": "oklch(0.55 0.19 295)", "$type": "color" },
        "2": { "$value": "oklch(0.58 0.16 246)", "$type": "color" },
        "3": { "$value": "oklch(0.58 0.14 158)", "$type": "color" },
        "4": { "$value": "oklch(0.68 0.16 72)", "$type": "color" },
        "5": { "$value": "oklch(0.59 0.18 350)", "$type": "color" }
      },
```

and the matching group inside `color.dark`, copying `src/app/globals.css:152-156`:

```json
      "chart": {
        "1": { "$value": "oklch(0.72 0.145 295)", "$type": "color" },
        "2": { "$value": "oklch(0.71 0.12 246)", "$type": "color" },
        "3": { "$value": "oklch(0.7 0.11 158)", "$type": "color" },
        "4": { "$value": "oklch(0.76 0.13 72)", "$type": "color" },
        "5": { "$value": "oklch(0.72 0.14 350)", "$type": "color" }
      },
```

Do not change `src/app/globals.css`: the runtime values are already correct and this file is the mirror, per `docs/design/DESIGN.md` "Tokens and source of truth".

- [ ] **Step 4: Document the GA4 setup this feature needs**

In `docs/OPERATIONS.md`, replace the bullet that begins "화면은 개요, 유입, 참여, 전환·수익, 실시간 보고서를 제공한다" with:

```markdown
- 화면은 개요, 유입, 참여, 전환·매출, 퍼널, 리텐션, 실시간 보고서를 제공한다. 결제 이벤트나
  UTM 등 소스 이벤트가 GA4에 수집되지 않은 경우에는 0을 실제 비즈니스 성과로 단정하지 않고
  명시적인 빈 상태를 표시한다.
```

and insert this subsection immediately after that bullet list (before `### 사용자 상세 행동 흐름`):

```markdown
#### 퍼널 · 리텐션 · 추세 · 필터 사전 설정

한 번만 해두면 되는 GA4 설정이다. 하지 않아도 화면은 뜨지만 해당 보고서가 0으로 보인다.
0을 "아무도 신청하지 않았다"로 읽기 전에 이 목록을 먼저 확인한다.

1. **사용자 속성 `account_type`** — 관리 → 맞춤 정의 → 맞춤 측정기준 만들기, 범위 **사용자**,
   사용자 속성 `account_type`(값 `business` / `consumer`). 등록 전에는 "계정 유형" 필터가
   비활성으로 표시되고 그 이유를 화면에 적는다. `dopa_uid`는 사용자 상세 화면용으로 이미
   등록되어 있어야 한다.
2. **이벤트 매개변수 `route` · `method` · `result`** — 퍼널의 `api_mutation` 단계는 이 세 매개변수로
   좁힌다. 단계가 계속 0이면 관리 → 맞춤 정의에서 **이벤트 범위** 맞춤 측정기준으로 등록한 뒤
   다시 확인한다. 맞춤 정의는 소급 적용되지 않는다.
3. **주요 이벤트** — `signup_completed`를 주요 이벤트로 지정한다. 이어서 "이벤트 만들기"로
   `party_apply_success`(`api_mutation`에서 `route`가 신청 라우트이고 `result` = `success`)와
   `payment_confirm_success`(`api_mutation`에서 `route`가 `/payments/confirm` 계열이고
   `result` = `success`)를 만든 뒤 둘 다 주요 이벤트로 지정한다. 그래야 개요의 `keyEvents`가
   실제 전환을 뜻한다.

알아둘 점:

- 퍼널은 `v1alpha`의 `runFunnelReport`를 사용한다. 호스트(`analyticsdata.googleapis.com`)와
  권한은 나머지 보고서와 같지만 **할당량 풀이 Core와 별개(Funnel)** 다. 퍼널 할당량이 소진돼도
  개요·표·실시간은 계속 동작하며, 화면의 할당량 표시는 어느 풀인지 함께 적는다.
- 퍼널 단계의 라우트 목록에는 `/v2` 접두사가 붙은 형태와, 라우트 템플릿 수정 이전 빌드가 보내던
  `/parties/:id/:id` 형태가 모두 들어 있다. 1.0.6 이상이 대부분이 되면 뒤쪽을 제거한다.
- 웹 `app_cta_click` → 앱 `first_open`은 한 퍼널로 묶을 수 없다. 데이터 스트림이 다르고
  클라이언트 ID가 이어지지 않는다. 온보딩 퍼널을 웹·앱 각각으로 보고 비교한다.
- 리텐션은 `firstSessionDate` 기준 **주간 코호트 6개**(일~토, 완전히 끝난 주만)와 이후 **4주**로
  고정이다. 기간 선택은 이 화면에 적용되지 않으며 화면에도 그렇게 적는다. 아직 끝나지 않은
  주는 `†`로 표시해 완결된 주와 구분한다. 코호트 요청에는 최상위 `dateRanges`를 넣지 않는다.
- 인사이트 요약 임계값: 합계 지표는 이전 기간 50명 이상 + 20% 이상 변화, 참여율은 5%p,
  플랫폼은 이전 기간 30명 이상 + 25% 이상 변화, 플랫폼 비중은 10%p. 최대 5개를 보여준다.
  아무 규칙도 걸리지 않고 비교 기준마저 작으면 "판단하지 않았다"고 명시한다.
- 개요의 일별 추세와 플랫폼 비교는 한 요청에 기간 두 개를 넣는다. GA4는 이때 `dateRange`
  측정기준을 응답 끝에 덧붙인다. 화면은 그 값이 요청에 준 이름이든 `date_range_0` 형태이든
  받아들이고, 둘 다 아니면 그 행을 버린다. 잘못 배정된 행 하나가 비교 전체를 한 기간
  밀어버리기 때문이다.
- 실시간 보고서에는 필터가 적용되지 않는다. 필터 바에 그렇게 표시된다.
- 지표·측정기준 조합이 유효한지 확신이 서지 않으면 Data API의 `checkCompatibility`로 확인한다.
```

- [ ] **Step 5: Run the release contracts and make them pass**

Run: `node --test scripts/test-admin-ui-foundation.mjs && node --test scripts/test-production-hardening.mjs`
Expected: PASS. `test-production-hardening.mjs` is unchanged and must stay green — it is the guard that keeps `recharts` out of `package.json`.

- [ ] **Step 6: Write the task record**

Create `docs/tasks/2026-09-08-ga4-funnel-retention-trends-insights.md`:

```markdown
# TASK: GA4 퍼널 · 리텐션 코호트 · 추세 차트 · 필터 · 인사이트

Status: implemented and locally verified on 2026-09-08; not deployed
Branch: `feat/analytics-analysis` (base: `feat/super-admin-user-detail` head b746e69)

## Objective

`/super-admin/analytics`를 "GA4 표를 읽는 화면"에서 "질문에 답하는 화면"으로 바꾼다.
백엔드 엔드포인트를 추가하지 않고, 브라우저에서 GA Data API를 직접 호출하는 기존 구조와
세션 수명 액세스 토큰을 그대로 유지한다.

## Required implementation

1. `analytics-data-api.ts`에 메서드별 버전 라우팅(`runFunnelReport`는 `v1alpha`,
   나머지는 `v1beta`), `getMetadata` GET, 코호트·퍼널 요청 타입과 zod/mini 스키마,
   `assertFunnelContract`를 추가한다. 기간 두 개를 요청할 때만 GA4가 덧붙이는
   `dateRange` 측정기준을 계약이 허용한다.
2. 규칙을 순수 모듈로 분리한다: `analytics-report-shaping`, `analytics-format`,
   `analytics-filters`, `funnel-definitions`, `analytics-funnel`, `analytics-retention`,
   `analytics-insights`, `analytics-quota`. 각각 자체 테스트를 가진다.
3. `analytics-reports.ts`는 개요를 이전 기간 비교(일별 추세 + 플랫폼 분해 + 인사이트)로
   바꾸고, 필터를 모든 Core 요청에 전달하며, 퍼널·리텐션을 각 모듈에 위임한다.
   `fetchAnalyticsCapabilities`는 속성 메타데이터로 `account_type` 등록 여부를 확인한다.
4. UI: 의존성 없는 인라인 SVG 추세 차트(지연 로딩), 필터 바, 인사이트 요약, 퍼널 패널,
   리텐션 히트맵, 할당량 배너. 상태는 색만으로 전달하지 않는다.
5. 릴리스 계약: 대시보드는 차트 모듈을 정적으로 import하지 않는다. `recharts`는 계속 금지.

## Non-goals and prohibitions

- Dopa 백엔드, Worker, 다른 저장소는 건드리지 않는다. 새 Next.js route handler도 없다.
- 차트 라이브러리를 새로 추가하지 않는다(`scripts/test-production-hardening.mjs` 가드).
- `zod` 대신 `zod/mini`만 사용한다.
- Google 액세스 토큰의 저장 위치와 수명을 바꾸지 않는다.
- GA4가 값을 주지 않은 자리를 0으로 보정하지 않는다.

## Verification

- `npm run verify` (vitest + release contracts + runtime boundaries + eslint + OpenNext build)
- 실제 데이터 검증에는 GA4 맞춤 정의(`account_type`, 이벤트 범위 `route`/`method`/`result`)와
  주요 이벤트 지정이 선행되어야 한다. `docs/OPERATIONS.md`의 "퍼널 · 리텐션 · 추세 · 필터
  사전 설정"을 참고한다. 저장소 빌드 성공은 이 외부 설정 완료의 증거가 아니다.
```

- [ ] **Step 7: Run the full verification**

Run: `npm run verify`
Expected: PASS — `vitest run`, `node --test scripts/test-*.mjs`, `check:admin-runtime`, `eslint`, and the OpenNext Cloudflare build all succeed.

If `eslint` reports an unused import in `AnalyticsDashboard.tsx` (the old `formatMetric` helpers or the deleted `conversion` local), delete the dead code rather than silencing the rule. If the OpenNext build reports the `bg-[color-mix(...)]` utility as unrecognised, apply the inline-`backgroundColor` fallback noted in Task 4 Step 8.

- [ ] **Step 8: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-analytics
git rev-parse --abbrev-ref HEAD   # must print feat/analytics-analysis
git add scripts/test-admin-ui-foundation.mjs docs/OPERATIONS.md \
  docs/design/design-tokens.json docs/tasks/2026-09-08-ga4-funnel-retention-trends-insights.md
git commit -m "$(cat <<'MSG'
docs(analytics): GA4 funnel/retention setup checklist, chart tokens, chunk contract

The funnel's api_mutation steps and the account-type filter both depend on GA4
custom definitions that do not apply retroactively. OPERATIONS now says which
ones, in what order, and that a zero step is a configuration question before it
is a product answer — plus the separate Funnel quota pool, the fixed six-week
cohort window, and why a two-range request's dateRange column is read by both
its name and its positional value.

design-tokens.json mirrors the five chart variables that already exist in
globals.css, and a new release contract keeps the dashboard's chart import
dynamic so the analytics route's first chunk stays free of it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

## API confirmation ledger

Confirmed against the Google Analytics Data API v1 documentation
(`/websites/developers_google_analytics_devguides_reporting_data_v1`) on 2026-09-08. The
indexed corpus covers the guides and the **v1beta** REST reference; it does **not** contain the
v1alpha `RunFunnelReportRequest` reference pages, so "not documented" below means "absent from
the indexed docs", never "refuted".

| Fact this plan relies on | Status |
| --- | --- |
| `POST …/v1alpha/properties/{id}:runFunnelReport`; response `{ funnelTable, funnelVisualization, kind: "analyticsData#runFunnelReport" }` | **Confirmed** |
| Request fields `dateRanges` (required), `funnel.steps[] { name, filterExpression }`, `funnelBreakdown.breakdownDimension`, `funnelBreakdown.limit` (default 5) | **Confirmed** |
| `funnelTable.dimensionHeaders[0].name === "funnelStepName"`; row values carry an API-added `"N. "` ordinal prefix | **Confirmed** (doc example: request step `"First open/visit"` → row value `"1. First open/visit"`) |
| `RESERVED_TOTAL` appears in the **breakdown** column (index 1) and marks the un-broken-down totals | **Confirmed** |
| Metrics `activeUsers`, `funnelStepCompletionRate`, `funnelStepAbandonments`, `funnelStepAbandonmentRate` | **Confirmed** |
| The two rate metrics are **fractions** (`0.412` = 41.2 %) despite `type: "TYPE_INTEGER"` | **Confirmed** — this is why `shapeFunnel` never reads `metricHeaders[].type` |
| `metadata.samplingMetadatas[] { samplesReadCount, samplingSpaceSize }`, one entry per date range | **Confirmed** |
| `funnelEventFilter { eventName }`, `funnelFieldFilter`, `orGroup { expressions }` | **Confirmed** |
| `andGroup` / `notExpression` in a funnel filter expression | **Not documented** — only prose ("AND, OR, and NOT logic"). Used by `mutationStep`. |
| `funnelParameterFilterExpression` and `FunnelParameterFilter { eventParameterName, stringFilter, inListFilter }` | **Not documented** — only the prose "funnel event filters for specific event names **and parameters**". This is the plan's largest unverified surface; the OPERATIONS checklist tells an operator to register `route`/`method`/`result` as event-scoped custom dimensions if the mutation steps read zero. |
| Whether `eventParameterName` needs a registered custom dimension | **Not documented.** The spec asserted "works without registration"; that claim is **unverified**. Do not repeat it as fact. (`runReport` *does* require registration for `customEvent:` fields — a different mechanism, do not generalise.) |
| `returnPropertyQuota` / `dimensionFilter` / `limit` / `isOpenFunnel` on a funnel request; `propertyQuota` in a funnel response | **Not documented.** The plan sends only `returnPropertyQuota` and `dimensionFilter`, treats `propertyQuota` as optional, and never sends `isOpenFunnel` or `limit`. |
| `cohortSpec { cohorts[], cohortsRange { granularity, startOffset, endOffset }, cohortReportSettings { accumulate } }` | **Confirmed** (`accumulate` is unsupported in standard requests and is not used) |
| `Cohort.dimension` supports only `firstSessionDate` | **Confirmed**, verbatim |
| A `cohortSpec` request must omit top-level `dateRanges` | **Not stated explicitly**, but every doc example omits it and `cohortSpec` "requires the 'cohort' dimension". The plan omits it. |
| WEEKLY weeks run **Sunday–Saturday**; aligning the cohort range to week boundaries is *recommended* | **Confirmed** (alignment is worded as a recommendation, not a requirement; the plan aligns anyway) |
| "WEEKLY offsets are ×7 days" | **Not documented** — docs only say granularity "defines how start and end offsets are interpreted". The plan's `endOffset: 4` is read as four weekly offsets and the cell dates are computed locally from the cohort start, so this claim is never depended on. |
| Dimensions `cohort`, `cohortNthDay`, `cohortNthWeek`; metrics `cohortActiveUsers`, `cohortTotalUsers` | **Confirmed** (`cohortNthMonth` not found; unused) |
| `cohortNthWeek` values are zero-padded 4-digit strings, and cohort rows come back **unordered** | **Confirmed** — `shapeRetention` indexes into a map instead of trusting row order |
| Unnamed cohorts get positional row values (`cohort_0`) | **Confirmed** — `resolveCohortName` accepts that form as a fallback |
| Two `dateRanges` append a **trailing** `dateRange` dimension, valued `date_range_0` / `date_range_1` | **Confirmed.** What a supplied `name` produces is **not documented** — hence `rangeSlot()` accepting both forms. **This corrects the spec**, which assumed the names come back. |
| `platform` values `"iOS"` and `"Android"` | **Confirmed** from a real response body |
| `platform` value `"web"` (exact casing) | **Not confirmed** — prose only, and the docs never enumerate the dimension's domain. Hence `inListFilter` omits `caseSensitive` (GA4 defaults it to false) and `normalizePlatform` folds casing on the way back. |
| `runFunnelReport` draws from a **Funnel** pool distinct from Core and Realtime | **Confirmed**, verbatim |
| `PropertyQuota` fields `tokensPerDay`, `tokensPerHour`, `concurrentRequests`, `serverErrorsPerProjectPerHour`, `potentiallyThresholdedRequestsPerHour`, `tokensPerProjectPerHour` | **Confirmed** |
| `QuotaStatus { consumed, remaining }` | **Confirmed in prose**, not shown as JSON. The existing `quotaEntrySchema` already defaults both to 0, so an absent field cannot produce a wrong reading. |
| Quota limits 200,000/day and 40,000/hour (standard) | **Confirmed** |
| `GET …/v1beta/properties/{id}/metadata` → `{ name, dimensions[], metrics[], comparisons[] }`; `DimensionMetadata { apiName, uiName, description, deprecatedApiNames[], customDefinition, category }` | **Confirmed.** The plan's schema is a `looseObject`, so `comparisons` and `deprecatedApiNames` pass through untouched. |
| `activeUsers`, `newUsers`, `sessions` valid with the `date` dimension | **Confirmed** by a doc example |
| Restrictions on combining those metrics | **Not documented.** `checkCompatibility` is the documented way to settle it; noted in OPERATIONS rather than assumed. |

## Self-review

**Spec coverage.** Every numbered section of the design spec maps to a task:

| Spec section | Task |
| --- | --- |
| §1 Data API client (version routing, `performAnalyticsRequest`, `getAnalyticsMetadata`, cohort/funnel types + schema, `assertFunnelContract`, `dateRange` in `assertReportContract`) | Task 1 |
| §2 Funnel (`APP_EVENTS`, step helpers, three presets, `buildFunnelRequest`, `shapeFunnel`, `fetchFunnel`, `AnalyticsFunnelResult`) | Task 2 (2A labels, 2B definitions + shaping), types in 2A |
| §2 `FunnelPanel.tsx` | Task 4 |
| §3 Retention (`buildWeeklyCohorts`, `buildRetentionRequest`, `shapeRetention`, result type) | Task 2B / types in 2A |
| §3 `RetentionHeatmap.tsx` | Task 4 |
| §4 `charts/TrendChart.tsx`, `TrendPanel`, `fetchOverview` series/platforms, `analytics-filters.ts`, filter threading, capabilities, `AnalyticsFilterBar.tsx` | Tasks 2A (filters), 3 (overview + capabilities), 4 (chart, panel, bar) |
| §5 Insights + `InsightsPanel.tsx` | Task 2B (rules), Task 4 (panel) |
| §6 View wiring, quota UX (`analytics-quota.ts`, `QuotaBanner`, `QuotaFooter` labels), dashboard mock extension | Task 2A (quota module), Task 4 (wiring + mocks) |
| §7 Tests | Every task; the release contract in Task 5 |
| §8 Docs (OPERATIONS, design tokens, task doc) | Task 5 |

**Deviations from the spec, all deliberate and argued inline:** no `analytics-events.ts` (Task 2 preamble); `dataQualityNoticesForReport` takes metadata rather than a report (Task 2 preamble); the retention test builds its clock from local components instead of `vi.setSystemTime` with an offset string (Task 2 preamble); no `metricFilter` on `AnalyticsRunReportRequest` (Task 2 preamble); `RANGE_DAYS`/`analyticsDateRange` move into `analytics-report-shaping.ts` to avoid an import cycle (Task 2 preamble); the two-range `dateRange` column is read by name **or** position (Task 3 preamble, corrects the spec); the funnel view keeps its panel when empty so its preset selector stays reachable (Task 4 Step 14); the quota banner reads a lifted `latestQuota` from the query view rather than poking the query cache, so it re-renders (Task 4 Step 13); `types.ts` — including the view union the spec assigned to the UI task — lands in Task 2A because the pure modules produce those result types; and Task 2 carries two commit checkpoints (2A/2B) because nine modules in one commit is not a reviewable unit.

**Placeholder scan.** No "TBD", "similar to Task N", "add error handling", or test step without test code. Every code step contains complete, runnable code; the one deliberately abbreviated block — `definitionsForView`'s three unchanged branches in Task 3 Step 6 — states precisely which argument each existing call gains, and the surrounding file is already in the repo.

**Type consistency (checked across tasks).** `AnalyticsQuotaState` gains `category` in Task 2A and every producer passes it (`quotaFromReports(reports, pool)` in Tasks 2A/2B/3) and every consumer reads it (`QUOTA_POOL_LABELS[quota.category]`, `quotaPressure`) in Task 4. `dataQualityNoticesForReport(metadata, scope)` has the same two-argument shape at all four call sites (`analytics-reports.ts`, `user-behavior-report.ts`, `analytics-funnel.ts`, `analytics-retention.ts`). `AnalyticsFilters` is produced by `analytics-filters.ts` (2A) and consumed identically by `funnel-definitions.ts`, `analytics-funnel.ts`, `analytics-retention.ts` (2B), `analytics-reports.ts` (3) and `AnalyticsFilterBar`/`AnalyticsDashboard` (4). `AnalyticsTrendMetric`/`AnalyticsTrendSeries`/`AnalyticsTrendValues` are declared once in 2A and used by `analytics-reports.ts`, `TrendChart` and the dashboard. `FunnelId` comes from `funnel-definitions.ts` in 2B and is the type of the dashboard's `funnelId` state and of `FetchAnalyticsReportInput.funnelId`. `analyticsQueryKeys.report` takes six arguments after Task 4 and has exactly one caller. `TrendChartProps` is declared in `charts/TrendChart.tsx` (Task 4 Step 2) and referenced by name in the dashboard (Step 13) and in the release contract (Task 5 Step 1). `shapeFunnel` returns `{ steps, breakdown }` and `fetchFunnel` spreads exactly those two into `AnalyticsFunnelResult`.
