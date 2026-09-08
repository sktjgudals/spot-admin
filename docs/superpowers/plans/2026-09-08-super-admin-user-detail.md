# `/super-admin/users/[id]` — 사용자 상세 · 플로우 · 행동(GA4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SUPER_ADMIN user detail route at `/super-admin/users/[id]` that shows one operator screen combining the account profile, a cursor-paged server-side activity timeline, and that same user's in-app screen flow read live from GA4 in the browser.

**Architecture:** Server data goes through the existing `adminFetchJson` client to the Cloudflare Worker (`/admin/v2/users/:id`, `…/timeline`, `…/summary`); GA data is fetched directly from `https://analyticsdata.googleapis.com` by a lazily-loaded chunk that reuses the analytics OAuth token store. Three layers are added bottom-up: a data layer (`admin-users.api.ts` + routes + query keys), a pure GA report module (`user-behavior-report.ts`), and a `src/features/users/*` composition. Shared analytics pieces currently inlined in `AnalyticsDashboard.tsx` are extracted first so both the dashboard and the new panel use one copy.

**Tech Stack:** Next.js 16 App Router (React 19.2.4) on OpenNext/Cloudflare Workers, TanStack Query v5, Base UI (`@base-ui/react`) + Tailwind v4 semantic tokens, `zod/mini`, lucide-react, Vitest 3 + jsdom + Testing Library, `node --test` for release-contract scripts.

**Spec:** `docs/superpowers/specs/2026-09-08-super-admin-user-detail-design.md` — read it before Task 1. The plan argues from it; where the code contradicted the spec, the code won and the deviation is called out inline.

## Global Constraints

Every task's requirements implicitly include this section.

### Workspace
- Work **only** inside `/Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail` (git worktree, branch `feat/super-admin-user-detail`, base `origin/main` 9a9f0d4). `npm ci` is already done.
- **Never** `cd` into `/Users/seohyeongmin/Desktop/github/spot-admin` (a different checkout) or `/Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin` (a sibling worktree on another branch). Bash working directories reset between calls — always use absolute paths.
- Before every commit, re-check the branch: `git -C <worktree> rev-parse --abbrev-ref HEAD` must print `feat/super-admin-user-detail`.

### Runtime boundaries (`scripts/check-admin-runtime-boundaries.mjs`, verified)
The check scans every `.js/.jsx/.mjs/.ts/.tsx` under `src/` plus `package.json`, `next.config.ts`, `.env.example`. No file may contain:
- `@/lib/prisma`, `generated/prisma`, `@prisma/client`, `@prisma/adapter-pg`, `PrismaClient`
- `DATABASE_URL`
- a string literal starting `/api/super-admin`, `/api/business`, `/api/party-categories`
- `@/lib/api-auth`, `@/lib/backend-internal`, `@/lib/fetch-json`, `@/lib/legacy-bff`
- a string literal starting `/business` (note: `/businesses/...` is fine, `"/business/"` is not)

All server reads go through `adminFetchJson` from `@/auth/api/admin-http`. No new Next.js route handlers.

### Endpoint contract (exact)
| Purpose | Path | Notes |
| --- | --- | --- |
| detail | `GET /admin/v2/users/:id` | may carry an inline `summary` |
| summary | `GET /admin/v2/users/:id/summary` | 404 → `null` |
| timeline | `GET /admin/v2/users/:id/timeline` | query params below |
| ban | `POST /admin/v2/users/:id/ban` | already produced by `statusAction` in `resource-configs/helpers.ts` |
| unban | `POST /admin/v2/users/:id/unban` | same |

Timeline query params, always built with `new URLSearchParams()` and appended in this order: `kinds` (joined with `,`), `categories` (joined with `,`), `from`, `to`, `cursor` (verbatim, never parsed), `limit` (default `20`; backend caps at 50).

**Verified deviation from the spec:** `URLSearchParams.toString()` percent-encodes `,` as `%2C` and `:` as `%3A`. The spec's illustrative query string `kinds=a,b&from=…&cursor=…&limit=20` is therefore not what ships. Assert the encoded form in tests:
`kinds=USER_SIGNUP%2CSESSION_CREATED&from=2026-06-01T00%3A00%3A00.000Z&cursor=abc%3D%3D&limit=20`

### GA4 request contract (exact)
- Dimension carrying the Dopa user id: `customUser:dopa_uid` (user-scoped GA4 custom dimension, registered from the `dopa_uid` user property).
- Behavior request dimensions, in this order: `dateHourMinute`, `eventName`, `unifiedScreenName`, `platform`. Metric: `eventCount`.
- `orderBys: [{ dimension: { dimensionName: "dateHourMinute" } }]`, `limit: PAGE_LIMIT` (10_000), `offset`, `returnPropertyQuota: true`.
- `dimensionFilter: { filter: { fieldName: "customUser:dopa_uid", stringFilter: { matchType: "EXACT", value: userId } } }`.
- Date ranges: `7d` → `{ startDate: "7daysAgo", endDate: "today" }`; `28d` → `{ startDate: "28daysAgo", endDate: "today" }`. Only `7d` and `28d` exist for this panel.
- Session heuristic: a gap **greater than** `SESSION_GAP_MINUTES = 30` starts a new session (exactly 30 continues the same session).
- Paging cap: `MAX_PAGES = 3`. Past that, set `truncated: true` and say so in the UI.
- `runAnalyticsReport` calls `assertReportContract`, which requires the response's dimension/metric headers to match the request **in order**. Test fixtures must include matching `dimensionHeaders`/`metricHeaders`.

### Token lifecycle
- The Google access token is **session-bound and memory-only**. It survives route unmount, and is dropped when the admin session generation changes (`getAdminSessionGeneration()` from `@/auth/store/admin-auth.store`), on explicit disconnect, on expiry, and on tab close/reload.
- It is never written to `localStorage`, `sessionStorage`, cookies, the URL, logs or Sentry.
- `docs/OPERATIONS.md` must keep the literal phrase **`브라우저 메모리`** (asserted by `scripts/test-admin-ui-foundation.mjs`).

### Design rules (`docs/design/DESIGN.md` + `scripts/test-admin-ui-foundation.mjs`)
- Semantic tokens only. No raw palette utilities matching `(?:bg|text|border|ring|fill)-(?:red|green|emerald|amber|yellow|blue|violet|purple|pink)-` anywhere under `src/`.
- No `text-[9px]`, `text-[10px]`, `text-[11px]`.
- Focus rings use the opaque token: `focus-visible:ring-ring` / `focus-visible:ring-sidebar-ring`. Never `ring-ring/50`-style alpha (`focus(-visible)?:ring-(ring|sidebar-ring)\/\d+` is a hard failure).
- Validation imports come from `zod/mini` only. `from "zod"` anywhere under `src/` fails the release test.
- Status is never color-only: text or an icon accompanies every semantic color.
- Loading states preserve the shape of the final content; errors say what failed and offer one retry; empty states distinguish "no data" from "filtered out".
- GA reporting code stays out of the users route's initial chunk — `UserDetailPage.tsx` loads `UserBehaviorPanel` through `createRetryableLazyComponent` and never statically imports `analytics-data-api` or `google-analytics-oauth`.
- Numbers, amounts and timestamps use `tabular-nums`.

### Korean UI copy asserted by tests (verbatim)
Header / page: `← 사용자 목록` · `현재 위치` · `사용자 상세 섹션` · `활동 플로우` · `앱 행동 흐름` · `사용자를 찾을 수 없습니다` · `이 계정을 볼 권한이 없습니다.` · `사용자 정보를 불러오지 못했습니다.` · `다시 시도` · `요약 정보 준비 중` · `로그인 제한` · `탈퇴` · `가입` · `수정` · `평점` · `마지막 활동` · `기기` · `활동` · `동의`

Timeline: `플로우 분류` · `기간` · `최근 7일` · `최근 28일` · `최근 90일` · `전체` · `새로고침` · `더 보기` · `다음 활동을 불러오지 못했습니다. 이미 불러온 활동은 그대로 유지했습니다.` · `다음 페이지 다시 시도` · `표시할 활동이 없습니다` · `조건에 맞는 활동이 없습니다` · `활동을 불러오지 못했습니다.` · `DB` · `감사 로그` (source labels keyed by wire values: identity/domain/notification → DB, admin → 감사 로그 — controller ruling 2026-09-09)

Behavior panel: `GA4 설정 필요` · `Google Analytics 연결` · `Google Analytics 연결이 만료되었습니다.` · `연결 끊기` · `행동 조회 기간` · `GA4에 사용자 식별 측정기준이 아직 없어요` · `아직 수집된 행동이 없어요` · `임계값 때문에 표시되지 않을 수 있어요` · `세션` · `이벤트` · `화면 조회` · `행동 분석 모듈을 불러오지 못했습니다.` · `권한` · `보관` · `전송` · `analytics.readonly만 요청` · `이 탭의 메모리에만 유지 · 로그아웃 시 삭제` · `Google Data API로 직접 요청`

Navigation: `상세 페이지 열기`

### Test commands
- One file: `npx vitest run <file>` (run from the worktree root).
- Release contracts: `node --test scripts/test-admin-ui-foundation.mjs`
- Everything: `npm run verify` = `vitest run` + `node --test scripts/test-*.mjs` + `check:admin-runtime` + `eslint` + OpenNext build.
- Do **not** run `npx prettier`; the repo has no prettier step and reformatting breaks unrelated release-test regexes.

### Commit trailers
Every commit message body ends with these two lines, verbatim:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
```

### Backend coupling caveat
`TIMELINE_CATEGORIES[].kinds` in Task 5 lists the kind strings this frontend sends as the `kinds` filter. They must be reconciled with the enum in the parallel backend PR `feat/admin-user-timeline` before merge. `filterTimelineItems` also matches on `item.category` (which the server sends on every row), so an unrecognised kind can never hide a row from the UI — that client-side filter is the safety net, not a nicety.

---

## File Structure

**Create**
- `src/auth/api/admin-users.api.ts` — user detail/summary/timeline types, normalizers, fetchers, `isAdminNotFound` / `isAdminForbidden`
- `src/auth/api/admin-users.api.test.ts`
- `src/features/analytics/analytics-query-keys.ts` — one key factory for every GA query
- `src/features/analytics/analytics-labels.ts` — `EVENT_LABELS`
- `src/features/analytics/AnalyticsStates.tsx` — `StatusCard`, `ConnectionFact`, `AnalyticsErrorState`, `errorPresentation`, `DataQualityPanel`, `QuotaFooter`
- `src/features/analytics/use-analytics-connection.ts` — connect / disconnect / GIS preload / cache reset
- `src/features/analytics/user-behavior-report.ts` — GA request builder + minute parsing + row shaping + paging
- `src/features/analytics/user-behavior-report.test.ts`
- `src/features/analytics/use-user-behavior-query.ts`
- `src/features/analytics/UserBehaviorPanel.tsx`
- `src/features/analytics/UserBehaviorPanel.test.tsx`
- `src/features/users/user-timeline-model.ts` — pure grouping, labels, icons, ref→href, category→kinds
- `src/features/users/user-timeline-model.test.ts`
- `src/features/users/use-user-detail-query.ts`
- `src/features/users/use-user-timeline-query.ts`
- `src/features/users/UserDetailHeader.tsx`
- `src/features/users/UserFlowTimeline.tsx`
- `src/features/users/UserFlowTimeline.test.tsx`
- `src/features/users/UserDetailPage.tsx`
- `src/features/users/UserDetailPage.test.tsx`
- `src/app/(super-admin)/super-admin/users/[id]/page.tsx`
- `src/app/(super-admin)/super-admin/users/[id]/page.test.tsx`

**Modify**
- `src/auth/model/admin-routes.ts` — `AdminApi.user/userTimeline/userSummary/userBan/userUnban`, `ROUTE_SUPER_ADMIN_USERS`, `superAdminUserDetailPath`
- `src/auth/model/admin-routes.test.ts`, `src/auth/model/admin-query-keys.ts`, `src/auth/model/admin-query-keys.test.ts`
- `src/features/analytics/analytics-data-api.ts` — filter expressions, `offset`, `unknown-field` error kind
- `src/features/analytics/analytics-data-api.test.ts`
- `src/features/analytics/analytics-reports.ts` — export `dataQualityNoticesForReport`
- `src/features/analytics/analytics-token-store.ts` — admin-session binding
- `src/features/analytics/analytics-token-store.test.ts`
- `src/features/analytics/AnalyticsDashboard.tsx` — consume the extracted modules, stop clearing the token on unmount, copy tweaks
- `src/features/analytics/AnalyticsDashboard.test.tsx` — one inverted test
- `src/lib/format-date.ts` — `formatDayLabel`, `formatDateOnly`
- `src/components/admin/resource-configs/types.ts` — `detailHref?`
- `src/components/admin/resource-configs/users.ts` — `detailHref`
- `src/components/admin/resource-console/ResourceList.tsx` — first-column link
- `src/components/admin/resource-console/ResourceDetailSheet.tsx` — footer link button
- `src/components/admin/AdminResourceConsole.test.tsx`, `src/components/admin/AdminResourceConsole.config.test.ts`, `src/components/layout/AdminSidebar.test.ts`
- `docs/OPERATIONS.md`, `.env.example`, `scripts/test-admin-ui-foundation.mjs`

**Not created on purpose:** `src/app/(super-admin)/super-admin/users/page.tsx`. The Next.js route table is built from `page.tsx` files; adding the `[id]` segment alone makes `/super-admin/users/<id>` resolve to the new page while `/super-admin/users` keeps resolving to the existing `[section]/page.tsx`. Creating `users/page.tsx` would break the list.

---

### Task 1: Data layer — routes, query keys, `admin-users.api.ts`

**Files:**
- Modify: `src/auth/model/admin-routes.ts` (append to `AdminApi`, which ends at `paymentConfirm` on line 188; add two exports near `businessPartyDetailPath`)
- Modify: `src/auth/model/admin-query-keys.ts:32` (add a `users` block before `mailOutbox`)
- Create: `src/auth/api/admin-users.api.ts`
- Test: `src/auth/api/admin-users.api.test.ts`
- Test: `src/auth/model/admin-routes.test.ts` (append one `it`)
- Test: `src/auth/model/admin-query-keys.test.ts` (append one `it`)

**Interfaces:**
- Consumes: `adminFetchJson<T>(path: string, init?: AdminFetchInit): Promise<T>` from `@/auth/api/admin-http`; `AdminAuthError` (fields `code: string`, `status: number | null`, `permanent: boolean`) from `@/auth/model/admin-auth.errors`.
  **Verified deviation:** the spec's "Reusable code" block lists `AdminAuthError` under `admin-http.ts`. The class is actually declared in `src/auth/model/admin-auth.errors.ts` and only *thrown* by `admin-http.ts`. Import it from the model path.
- Produces, for Tasks 5 and 6:
  - `AdminApi.user(userId)`, `AdminApi.userTimeline(userId)`, `AdminApi.userSummary(userId)`, `AdminApi.userBan(userId)`, `AdminApi.userUnban(userId)` — all `(userId: string) => string`
  - `ROUTE_SUPER_ADMIN_USERS: "/super-admin/users"`, `superAdminUserDetailPath(userId: string): string`
  - `adminQueryKeys.users.{ all, detail(userId), summary(userId), timeline(userId, filters?) }`
  - `getAdminUser(userId): Promise<AdminUserDetail>`
  - `getAdminUserSummary(userId): Promise<AdminUserSummary | null>`
  - `getAdminUserTimeline(userId, params?: UserTimelineParams): Promise<UserTimelinePage>`
  - `isAdminNotFound(error: unknown): boolean`, `isAdminForbidden(error: unknown): boolean`
  - types `AdminUserDetail`, `AdminUserSummary`, `AdminUserSession`, `AdminUserPushToken`, `AdminUserRestriction`, `UserTimelineItem`, `UserTimelineRefs`, `UserTimelineCoverage`, `UserTimelineCoverageEntry`, `UserTimelinePage`, `UserTimelineFilters`, `UserTimelineParams`

Read first: `src/auth/api/admin-party.api.ts:254-306` (the `normalizeParty` pattern — a module-private normalizer that fills every field with a defined default, never exported) and `src/auth/api/admin-reports.api.ts:74-84` (the `URLSearchParams` query-building pattern) and `src/auth/api/admin-reports.api.test.ts:1-19` (the `vi.mock` + top-level-`await import` test pattern this repo uses for API modules).

- [ ] **Step 1: Write the failing route + key tests**

Append to `src/auth/model/admin-routes.test.ts`, inside the existing `describe("admin-routes scope contract", …)` block (before its closing `});`):

```ts
  it("exposes encoded SUPER_ADMIN user endpoints and the detail route", () => {
    expect(AdminApi.user("u/1")).toBe("/admin/v2/users/u%2F1");
    expect(AdminApi.userTimeline("u/1")).toBe("/admin/v2/users/u%2F1/timeline");
    expect(AdminApi.userSummary("u/1")).toBe("/admin/v2/users/u%2F1/summary");
    expect(AdminApi.userBan("u 1")).toBe("/admin/v2/users/u%201/ban");
    expect(AdminApi.userUnban("u 1")).toBe("/admin/v2/users/u%201/unban");
    expect(ROUTE_SUPER_ADMIN_USERS).toBe("/super-admin/users");
    expect(superAdminUserDetailPath("u/1")).toBe("/super-admin/users/u%2F1");
  });
```

and widen that file's import to:

```ts
import {
  businessPartiesPath,
  homePathForRole,
  AdminApi,
  resolveBusinessScope,
  ROUTE_SUPER_ADMIN_USERS,
  superAdminUserDetailPath,
} from "@/auth/model/admin-routes";
```

Append to `src/auth/model/admin-query-keys.test.ts`, inside `describe("adminQueryKeys", …)`:

```ts
  it("nests user summary and timeline under one detail key", () => {
    expect(adminQueryKeys.users.all).toEqual(["admin", "users"]);
    expect(adminQueryKeys.users.detail("u1")).toEqual([
      "admin",
      "users",
      "detail",
      "u1",
    ]);
    expect(adminQueryKeys.users.summary("u1")).toEqual([
      ...adminQueryKeys.users.detail("u1"),
      "summary",
    ]);
    expect(adminQueryKeys.users.timeline("u1")).toEqual([
      ...adminQueryKeys.users.detail("u1"),
      "timeline",
      {},
    ]);
    expect(adminQueryKeys.users.timeline("u1", { categories: "PARTY" })).toEqual([
      ...adminQueryKeys.users.detail("u1"),
      "timeline",
      { categories: "PARTY" },
    ]);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/auth/model/admin-routes.test.ts src/auth/model/admin-query-keys.test.ts`
Expected: FAIL — `ROUTE_SUPER_ADMIN_USERS` is not exported, `adminQueryKeys.users` is undefined.

- [ ] **Step 3: Add the routes and keys**

In `src/auth/model/admin-routes.ts`, after `businessPartyDetailPath` (line 55):

```ts
/** SUPER_ADMIN user list — the generic `[section]` console renders it. */
export const ROUTE_SUPER_ADMIN_USERS = "/super-admin/users";

/**
 * SUPER_ADMIN user detail.
 *
 * `/super-admin/users` stays on the generic `[section]` page; only the nested
 * `[id]` segment has its own `page.tsx`, so adding this path does not shadow
 * the list route.
 */
export function superAdminUserDetailPath(userId: string): string {
  return `/super-admin/users/${encodeURIComponent(userId)}`;
}
```

In the same file, inside `AdminApi`, immediately after the `party`/`placesKakaoSearch` group and before `partyTransitions` (keeps user endpoints together):

```ts
  user: (userId: string) => `/admin/v2/users/${encodeURIComponent(userId)}`,
  userTimeline: (userId: string) =>
    `/admin/v2/users/${encodeURIComponent(userId)}/timeline`,
  userSummary: (userId: string) =>
    `/admin/v2/users/${encodeURIComponent(userId)}/summary`,
  userBan: (userId: string) =>
    `/admin/v2/users/${encodeURIComponent(userId)}/ban`,
  userUnban: (userId: string) =>
    `/admin/v2/users/${encodeURIComponent(userId)}/unban`,
```

In `src/auth/model/admin-query-keys.ts`, add before the `mailOutbox` block:

```ts
  users: {
    all: ["admin", "users"] as const,
    detail: (userId: string) => ["admin", "users", "detail", userId] as const,
    summary: (userId: string) =>
      ["admin", "users", "detail", userId, "summary"] as const,
    /**
     * The generic list console caches under `["admin-v2", "users", …]`.
     * These keys are the detail-page cache; ban/unban invalidates both.
     */
    timeline: (userId: string, filters: Record<string, unknown> = {}) =>
      ["admin", "users", "detail", userId, "timeline", filters] as const,
  },
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/auth/model/admin-routes.test.ts src/auth/model/admin-query-keys.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing API test**

Create `src/auth/api/admin-users.api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

const fetchJson = vi.fn();
vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: (...args: unknown[]) => fetchJson(...args),
}));

const {
  getAdminUser,
  getAdminUserSummary,
  getAdminUserTimeline,
  isAdminForbidden,
  isAdminNotFound,
} = await import("./admin-users.api");

afterEach(() => {
  fetchJson.mockReset();
});

describe("getAdminUser", () => {
  it("encodes the id and fills every field a partial row omits", async () => {
    fetchJson.mockResolvedValue({ id: "u/1", nickname: "민정" });

    const user = await getAdminUser("u/1");

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u%2F1");
    expect(user).toEqual({
      id: "u/1",
      email: null,
      nickname: "민정",
      profileImage: null,
      provider: null,
      role: "USER",
      status: "ACTIVE",
      averageRating: null,
      createdAt: null,
      updatedAt: null,
      assignedBusinessId: null,
      blocked: false,
      asOf: null,
      summary: null,
    });
  });

  it("adopts an inline summary so the detail route alone can render the page", async () => {
    fetchJson.mockResolvedValue({
      id: "u1",
      nickname: "민정",
      status: "SUSPENDED",
      blocked: true,
      summary: {
        profile: { id: "u1", nickname: "민정", lastSeenAt: "2026-09-07T10:00:00.000Z" },
        devices: {
          activeSessionCount: 2,
          sessions: [{ id: "s1", platform: "ios", appVersion: "1.0.5" }],
          pushTokens: [{ id: "p1", platform: "ios", appVersion: "1.0.5" }],
        },
        counts: {
          applications: { APPROVED: 3, PENDING: "nope" },
          payments: { count: 4, paidCount: 3, paidAmount: 90000, businessCount: 2 },
          refunds: { count: 1, completedAmount: 20000 },
          reportsFiled: 1,
          reportsReceived: { total: 2, pending: 1 },
          activeRestrictions: [{ id: "r1", kind: "DM_BLOCK" }],
        },
        consent: { termsVersion: "v3", agreedAt: "2026-01-02T00:00:00.000Z", marketingOptIn: true },
        asOf: "2026-09-08T00:00:00.000Z",
      },
    });

    const user = await getAdminUser("u1");

    expect(user.blocked).toBe(true);
    expect(user.status).toBe("SUSPENDED");
    expect(user.asOf).toBe("2026-09-08T00:00:00.000Z");
    expect(user.summary?.profile.lastSeenAt).toBe("2026-09-07T10:00:00.000Z");
    expect(user.summary?.devices.pushTokens[0]?.appVersion).toBe("1.0.5");
    expect(user.summary?.counts.applications).toEqual({ APPROVED: 3 });
    expect(user.summary?.counts.payments.paidAmount).toBe(90000);
    expect(user.summary?.counts.activeRestrictions[0]).toEqual({
      id: "r1",
      kind: "DM_BLOCK",
      reasonCode: null,
      startsAt: null,
      endsAt: null,
      issuedBy: null,
    });
    expect(user.summary?.consent?.marketingOptIn).toBe(true);
  });
});

describe("getAdminUserSummary", () => {
  it("reads the dedicated route and normalizes a sparse payload", async () => {
    fetchJson.mockResolvedValue({ asOf: "2026-09-08T00:00:00.000Z" });

    const summary = await getAdminUserSummary("u1");

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u1/summary");
    expect(summary).toEqual({
      profile: {
        id: "",
        nickname: "이름 없음",
        email: null,
        profileImage: null,
        status: "ACTIVE",
        createdAt: null,
        lastSeenAt: null,
        deletedAt: null,
      },
      devices: { activeSessionCount: 0, sessions: [], pushTokens: [] },
      counts: {
        applications: {},
        payments: { count: 0, paidCount: 0, paidAmount: 0, businessCount: 0 },
        refunds: { count: 0, completedAmount: 0 },
        reportsFiled: 0,
        reportsReceived: { total: 0, pending: 0 },
        activeRestrictions: [],
      },
      consent: null,
      asOf: "2026-09-08T00:00:00.000Z",
    });
  });

  it("returns null when the summary route reports 404 instead of failing the page", async () => {
    fetchJson.mockRejectedValue(
      new AdminAuthError("NOT_FOUND", "no user", { status: 404 }),
    );

    await expect(getAdminUserSummary("u1")).resolves.toBeNull();
  });

  it("rethrows every other failure", async () => {
    fetchJson.mockRejectedValue(
      new AdminAuthError("FORBIDDEN", "nope", { status: 403 }),
    );

    await expect(getAdminUserSummary("u1")).rejects.toBeInstanceOf(AdminAuthError);
  });
});

describe("getAdminUserTimeline", () => {
  it("defaults to a 20-row page and sends no filters", async () => {
    fetchJson.mockResolvedValue({ items: [], nextCursor: null });

    await getAdminUserTimeline("u1");

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u1/timeline?limit=20");
  });

  it("joins kinds and categories with commas and passes the cursor verbatim", async () => {
    fetchJson.mockResolvedValue({ items: [], nextCursor: null });

    await getAdminUserTimeline("u1", {
      kinds: ["USER_SIGNUP", "SESSION_CREATED"],
      categories: ["ACCOUNT"],
      from: "2026-06-01T00:00:00.000Z",
      cursor: "abc==",
      limit: 20,
    });

    // URLSearchParams percent-encodes "," and ":"; the cursor is never parsed.
    expect(fetchJson).toHaveBeenCalledWith(
      "/admin/v2/users/u1/timeline?kinds=USER_SIGNUP%2CSESSION_CREATED&categories=ACCOUNT&from=2026-06-01T00%3A00%3A00.000Z&cursor=abc%3D%3D&limit=20",
    );
  });

  it("omits empty filter arrays", async () => {
    fetchJson.mockResolvedValue({ items: [], nextCursor: null });

    await getAdminUserTimeline("u1", { kinds: [], categories: [] });

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u1/timeline?limit=20");
  });

  it("normalizes rows, refs and coverage, tolerating a non-array coverage", async () => {
    fetchJson.mockResolvedValue({
      user: { id: "u1", nickname: "민정", status: "ACTIVE" },
      items: [
        {
          id: "e1",
          at: "2026-09-08T02:00:00.000Z",
          kind: "PAYMENT_PAID",
          category: "PAYMENT",
          title: "결제 완료",
          amount: 20000,
          refs: { paymentId: "pay-1", partyId: "party-1", businessId: "", extra: "drop" },
          source: "db",
        },
        { at: "2026-09-08T01:00:00.000Z" },
      ],
      nextCursor: "cursor-2",
      asOf: "2026-09-08T03:00:00.000Z",
      coverage: {},
    });

    const page = await getAdminUserTimeline("u1");

    expect(page.user).toEqual({
      id: "u1",
      nickname: "민정",
      status: "ACTIVE",
      deletedAt: null,
    });
    expect(page.items[0]).toEqual({
      id: "e1",
      at: "2026-09-08T02:00:00.000Z",
      kind: "PAYMENT_PAID",
      category: "PAYMENT",
      title: "결제 완료",
      detail: null,
      refs: { paymentId: "pay-1", partyId: "party-1" },
      status: null,
      amount: 20000,
      meta: {},
      source: "db",
    });
    expect(page.items[1]?.id).toBe("UNKNOWN:2026-09-08T01:00:00.000Z:1");
    expect(page.items[1]?.category).toBe("ACCOUNT");
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.coverage).toEqual([]);
  });

  it("keeps only coverage entries that carry an operator-readable note", async () => {
    fetchJson.mockResolvedValue({
      items: [],
      nextCursor: null,
      coverage: [
        { category: "SESSION", source: "audit", retainedFrom: "2026-06-01T00:00:00.000Z", note: "접속 기록은 90일만 보관합니다." },
        { category: "PARTY" },
      ],
    });

    const page = await getAdminUserTimeline("u1");

    expect(page.coverage).toEqual([
      {
        category: "SESSION",
        source: "audit",
        retainedFrom: "2026-06-01T00:00:00.000Z",
        note: "접속 기록은 90일만 보관합니다.",
      },
    ]);
  });
});

describe("error predicates", () => {
  it("recognizes 404 and 403 admin failures and nothing else", () => {
    expect(isAdminNotFound(new AdminAuthError("NOT_FOUND", "x", { status: 404 }))).toBe(true);
    expect(isAdminNotFound(new AdminAuthError("HTTP_ERROR", "x", { status: 500 }))).toBe(false);
    expect(isAdminNotFound(new Error("404"))).toBe(false);
    expect(isAdminForbidden(new AdminAuthError("FORBIDDEN", "x", { status: 403 }))).toBe(true);
    expect(isAdminForbidden(new AdminAuthError("NOT_FOUND", "x", { status: 404 }))).toBe(false);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run src/auth/api/admin-users.api.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-users.api"`.

- [ ] **Step 7: Write `admin-users.api.ts`**

Create `src/auth/api/admin-users.api.ts`:

```ts
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
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run src/auth/api/admin-users.api.test.ts`
Expected: PASS (16 assertions across 10 tests)

- [ ] **Step 9: Confirm nothing else broke**

Run: `npx vitest run src/auth && npm run check:admin-runtime`
Expected: PASS, and `Admin runtime boundary check passed.`

- [ ] **Step 10: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD   # must print feat/super-admin-user-detail
git add src/auth/api/admin-users.api.ts src/auth/api/admin-users.api.test.ts \
        src/auth/model/admin-routes.ts src/auth/model/admin-routes.test.ts \
        src/auth/model/admin-query-keys.ts src/auth/model/admin-query-keys.test.ts
git commit -m "$(cat <<'MSG'
feat(users): add the SUPER_ADMIN user detail, summary and timeline data layer

Adds AdminApi.user/userTimeline/userSummary/userBan/userUnban, the
/super-admin/users detail path, adminQueryKeys.users, and admin-users.api.ts.

Every response passes through a normalizer that fills each field, so a
backend that ships one field late cannot blank the screen an operator
opened to investigate that very incident. The detail normalizer accepts an
inline `summary` as well as the separate /summary route, and a 404 from
/summary is read as "no value", not as a failure.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 2: GA client filters/offset/`unknown-field` + the pure `user-behavior-report` module

**Files:**
- Modify: `src/features/analytics/analytics-data-api.ts` (types at :6-37, `apiErrorBodySchema` at :81-88, `AnalyticsDataApiErrorKind` at :93-101, `AnalyticsDataApiError` at :103-120, `classifyResponseError` at :173-213)
- Modify: `src/features/analytics/analytics-reports.ts:169` (add `export` to `dataQualityNoticesForReport`)
- Create: `src/features/analytics/user-behavior-report.ts`
- Test: `src/features/analytics/analytics-data-api.test.ts` (append two `it`s)
- Test: `src/features/analytics/user-behavior-report.test.ts`

**Interfaces:**
- Consumes: `runAnalyticsReport(propertyId: string, request: AnalyticsRunReportRequest, options: AnalyticsDataApiOptions): Promise<AnalyticsReportResponse>`; `AnalyticsDataApiOptions = { accessToken: string; signal?: AbortSignal; fetchImpl?; wait? }`; `AnalyticsPropertyConfig = { id: string; label: string; platform: "web"|"ios"|"android"|"mixed" }`; `AnalyticsQuotaState = { entries: Array<{ key: string; consumed: number; remaining: number }> }`; `AnalyticsDataQualityNotice` (union over `kind: "thresholding" | "other-row" | "sampling"`) — all from `./types` / `./analytics-data-api`.
- Produces, for Tasks 3 and 4:
  - `AnalyticsFilterExpression`, `AnalyticsStringFilter`, `AnalyticsInListFilter`, `AnalyticsFieldFilter` types; `AnalyticsRunReportRequest` gains `dimensionFilter?: AnalyticsFilterExpression` and `offset?: number`
  - `AnalyticsDataApiErrorKind` gains `"unknown-field"`; `AnalyticsDataApiError` gains `apiMessage?: string` in its options and an `apiMessage` getter
  - `dataQualityNoticesForReport(report: AnalyticsReportResponse | undefined, definition: { key: string; title: string }): AnalyticsDataQualityNotice[]` — now exported from `analytics-reports.ts`
  - from `user-behavior-report.ts`: `GA4_USER_ID_DIMENSION`, `USER_BEHAVIOR_RANGES`, `UserBehaviorRange`, `SESSION_GAP_MINUTES`, `PAGE_LIMIT`, `MAX_PAGES`, `buildUserBehaviorRequest(userId, range, offset?)`, `parseGaMinute(value): GaMinute | null`, `shapeUserBehaviorRows(rows, meta): UserBehaviorFlow`, `fetchUserBehaviorFlow(input): Promise<UserBehaviorFlow>`, `pickUserBehaviorProperty(properties): AnalyticsPropertyConfig | null`, `formatFlowMinute(epochMinutes): string`, `formatFlowDay(day): string`, and the types `UserBehaviorRow`, `UserBehaviorEvent`, `UserBehaviorScreenVisit`, `UserBehaviorSession`, `UserBehaviorFlow`

Read first: `src/features/analytics/analytics-data-api.ts:173-213` (`classifyResponseError`) and `:236-262` (`assertReportContract` — it rejects any response whose dimension/metric headers do not match the request in order, which is why every fixture below spells the headers out) and `src/features/analytics/analytics-reports.ts:169-192` (`dataQualityNoticesForReport`).

- [ ] **Step 1: Write the failing GA-client tests**

Append to `src/features/analytics/analytics-data-api.test.ts`, inside `describe("Google Analytics Data API client", …)`:

```ts
  it("serializes a dimension filter and an offset for user-scoped paging", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          dimensionHeaders: [{ name: "dateHourMinute" }],
          metricHeaders: [{ name: "eventCount" }],
          rows: [],
          rowCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const request = {
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "dateHourMinute" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "customUser:dopa_uid",
          stringFilter: { matchType: "EXACT" as const, value: "user-1" },
        },
      },
      limit: 10_000,
      offset: 10_000,
      returnPropertyQuota: true,
    };

    await runAnalyticsReport("1234", request, {
      accessToken: "secret-access-token",
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  it("classifies an unregistered custom dimension as unknown-field and keeps Google's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 400,
            status: "INVALID_ARGUMENT",
            message:
              "Field customUser:dopa_uid is not a valid dimension. For a list of valid dimensions, see …",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const error = await runAnalyticsReport("1234", reportBody, {
      accessToken: "secret-access-token",
      fetchImpl,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AnalyticsDataApiError);
    expect((error as AnalyticsDataApiError).kind).toBe("unknown-field");
    expect((error as AnalyticsDataApiError).apiMessage).toContain(
      "is not a valid dimension",
    );
  });

  it("leaves other 400 responses as generic request errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 400, message: "Invalid date range." } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      runAnalyticsReport("1234", reportBody, {
        accessToken: "secret-access-token",
        fetchImpl,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsDataApiError>>({ kind: "request" }),
    );
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/analytics/analytics-data-api.test.ts`
Expected: FAIL — TS rejects `dimensionFilter`/`offset` on `AnalyticsRunReportRequest`, and the 400 case classifies as `request`.

- [ ] **Step 3: Extend the GA client**

In `src/features/analytics/analytics-data-api.ts`, after `AnalyticsOrderByRequest` (line 19):

```ts
export type AnalyticsStringFilter = {
  matchType?:
    | "EXACT"
    | "BEGINS_WITH"
    | "ENDS_WITH"
    | "CONTAINS"
    | "FULL_REGEXP"
    | "PARTIAL_REGEXP";
  value: string;
  caseSensitive?: boolean;
};

export type AnalyticsInListFilter = {
  values: readonly string[];
  caseSensitive?: boolean;
};

export type AnalyticsFieldFilter = {
  fieldName: string;
  stringFilter?: AnalyticsStringFilter;
  inListFilter?: AnalyticsInListFilter;
};

export type AnalyticsFilterExpression =
  | { filter: AnalyticsFieldFilter }
  | { andGroup: { expressions: readonly AnalyticsFilterExpression[] } }
  | { orGroup: { expressions: readonly AnalyticsFilterExpression[] } }
  | { notExpression: AnalyticsFilterExpression };
```

Add two members to `AnalyticsRunReportRequest`:

```ts
export type AnalyticsRunReportRequest = {
  dateRanges: readonly AnalyticsDateRangeRequest[];
  dimensions?: readonly AnalyticsDimensionRequest[];
  metrics: readonly AnalyticsMetricRequest[];
  dimensionFilter?: AnalyticsFilterExpression;
  orderBys?: readonly AnalyticsOrderByRequest[];
  limit?: number;
  offset?: number;
  keepEmptyRows?: boolean;
  returnPropertyQuota?: boolean;
};
```

Let the error body carry Google's sentence:

```ts
const apiErrorBodySchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      status: z.optional(z.string()),
      code: z.optional(z.number()),
      message: z.optional(z.string()),
    }),
  ),
});
```

Add the kind and the message channel:

```ts
export type AnalyticsDataApiErrorKind =
  | "expired"
  | "permission"
  | "quota"
  | "request"
  | "service"
  | "network"
  | "invalid-response"
  | "configuration"
  /** The property has no such dimension or metric — usually an unregistered custom definition. */
  | "unknown-field";

export class AnalyticsDataApiError extends Error {
  constructor(
    readonly kind: AnalyticsDataApiErrorKind,
    message: string,
    readonly options: {
      status?: number;
      retryAfterMs?: number;
      apiMessage?: string;
    } = {},
  ) {
    super(message);
    this.name = "AnalyticsDataApiError";
  }

  get status(): number | undefined {
    return this.options.status;
  }

  get retryAfterMs(): number | undefined {
    return this.options.retryAfterMs;
  }

  /** Google's own sentence, kept so the UI can name the missing field. */
  get apiMessage(): string | undefined {
    return this.options.apiMessage;
  }
}
```

Add the pattern next to `MAX_RETRIES` (line 4):

```ts
/**
 * GA4 answers a request naming a dimension the property has never registered
 * with a plain 400. Telling an operator "요청을 처리하지 못했습니다" there sends
 * them looking for a bug in this app instead of at the GA4 custom definition
 * they still have to create.
 */
const UNKNOWN_FIELD_PATTERN = /is not a valid (?:dimension|metric)/i;
```

Inside `classifyResponseError`, read the message alongside the status and add the branch just before the final generic return:

```ts
  const apiStatus = parsed.success ? parsed.data.error?.status : undefined;
  const apiMessage = parsed.success ? parsed.data.error?.message : undefined;
```

```ts
  if (
    response.status === 400 &&
    apiMessage !== undefined &&
    UNKNOWN_FIELD_PATTERN.test(apiMessage)
  ) {
    return new AnalyticsDataApiError(
      "unknown-field",
      "GA4 속성에 요청한 측정기준 또는 측정항목이 없습니다.",
      { status: response.status, apiMessage },
    );
  }
  return new AnalyticsDataApiError(
    "request",
    "Google Analytics 보고서 요청을 처리하지 못했습니다.",
    { status: response.status },
  );
```

Finally, in `src/features/analytics/analytics-reports.ts:169`, change the declaration to an export (the body and every existing caller stay as they are):

```ts
export function dataQualityNoticesForReport(
  report: AnalyticsReportResponse | undefined,
  definition: Pick<ReportDefinition, "key" | "title">,
): AnalyticsDataQualityNotice[] {
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/features/analytics/analytics-data-api.test.ts src/features/analytics/analytics-reports.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing `user-behavior-report` test**

Create `src/features/analytics/user-behavior-report.test.ts`:

```ts
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
    expect(request.dateRanges[0]).toEqual({
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
      .mockResolvedValue(gaResponse([row("202609080900", "screen_view", "Home")], 90_000));

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
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run src/features/analytics/user-behavior-report.test.ts`
Expected: FAIL — `Failed to resolve import "./user-behavior-report"`.

- [ ] **Step 7: Write `user-behavior-report.ts`**

Create `src/features/analytics/user-behavior-report.ts`:

```ts
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
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run src/features/analytics/user-behavior-report.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 9: Confirm the analytics suite still passes**

Run: `npx vitest run src/features/analytics`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD
git add src/features/analytics/analytics-data-api.ts \
        src/features/analytics/analytics-data-api.test.ts \
        src/features/analytics/analytics-reports.ts \
        src/features/analytics/user-behavior-report.ts \
        src/features/analytics/user-behavior-report.test.ts
git commit -m "$(cat <<'MSG'
feat(analytics): read one user's GA4 screen flow through customUser:dopa_uid

Adds dimension filters and offset paging to the GA4 Data API client, plus a
pure module that turns minute-level rows into sessions, screen visits and
events. A 400 naming a dimension the property never registered is now its own
"unknown-field" kind carrying Google's sentence, so the UI can point at the
missing GA4 custom definition instead of implying an app bug.

The paging cap is three pages; past it the result is marked truncated rather
than trailing off as if the user had stopped using the app.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 3: Session-bound token + shared analytics extraction

This task is **behaviour-preserving except for the token lifecycle**. `AnalyticsDashboard.test.tsx` must stay green apart from the one inverted test in Step 9. If any other dashboard assertion moves, the extraction changed behaviour — undo and re-extract.

**Files:**
- Modify: `src/features/analytics/analytics-token-store.ts`
- Create: `src/features/analytics/analytics-query-keys.ts`
- Create: `src/features/analytics/analytics-labels.ts`
- Create: `src/features/analytics/AnalyticsStates.tsx`
- Create: `src/features/analytics/use-analytics-connection.ts`
- Modify: `src/features/analytics/AnalyticsDashboard.tsx` (delete lines 65-73, 89-102, 118-139, 144-166, 319-351, 475-529, 720-815 and re-import them; change two copy strings)
- Test: `src/features/analytics/analytics-token-store.test.ts` (append three `it`s)
- Test: `src/features/analytics/AnalyticsDashboard.test.tsx:346-354` (invert one `it`)

**Interfaces:**
- Consumes: `getAdminSessionGeneration(): number` and `subscribeAccessToken(listener: () => void): () => void` from `@/auth/store/admin-auth.store`; `setAuthenticatedAdminSession(token, principal)`, `setRefreshedAdminSession(token, principal)`, `__resetAccessTokenForTests()` from the same module (tests only). `AnalyticsPropertyConfig`, `AnalyticsDateRange`, `AnalyticsReportView`, `AnalyticsQuotaState`, `AnalyticsDataQualityNotice` from `./types`. `UserBehaviorRange` from `./user-behavior-report` (Task 2).
- Produces, for Task 4:
  - `analyticsQueryKeys.all: readonly ["google-analytics"]`
  - `analyticsQueryKeys.report(generation: number, propertyId: string, view: AnalyticsReportView, range: AnalyticsDateRange)`
  - `analyticsQueryKeys.userBehavior(generation: number, propertyId: string, userId: string, range: UserBehaviorRange)`
  - `useAnalyticsConnection({ googleClientId: string; enabled: boolean }): { token: AnalyticsTokenSnapshot; connecting: boolean; connectionError: string | null; connect: () => Promise<void>; disconnect: () => void }`
  - `StatusCard({ icon, title, description, children })`, `ConnectionFact({ title, value })`, `AnalyticsErrorState({ error, retry })`, `errorPresentation(error: AnalyticsDataApiError | null): { title: string; description: string }`, `DataQualityPanel({ notices })`, `QuotaFooter({ quota })` from `./AnalyticsStates`
  - `EVENT_LABELS: Record<string, string>` from `./analytics-labels`

**Verified deviation:** the spec says the store's admin-session listener is attached by "the first `subscribeAnalyticsToken` subscriber". Keep exactly that, and note that `getAnalyticsAccessToken()` also checks the generation on every read — with no React subscriber mounted (a bare `getAnalyticsAccessToken()` call from a query function) the lazy check is the only thing that runs, so both paths are required, not one or the other.

Read first: `src/features/analytics/AnalyticsDashboard.tsx:118-166` (the four effects and `connect`/`disconnect` that move into the hook) and `src/auth/store/admin-auth.store.ts:64-83` (`setRefreshedAdminSession` deliberately does **not** bump the generation when the principal is unchanged — that is what makes "keeps it across a same-principal refresh" true).

- [ ] **Step 1: Write the failing token-store tests**

Replace the import block at the top of `src/features/analytics/analytics-token-store.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAccessTokenForTests,
  setAuthenticatedAdminSession,
  setRefreshedAdminSession,
} from "@/auth/store/admin-auth.store";
import {
  __resetAnalyticsTokenForTests,
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
  getAnalyticsTokenSnapshot,
  setAnalyticsAccessToken,
  subscribeAnalyticsToken,
} from "./analytics-token-store";

const PRINCIPAL = {
  id: "admin-1",
  role: "SUPER_ADMIN" as const,
  businessId: null,
};
```

Add `__resetAccessTokenForTests();` to the existing `beforeEach`, then append these three tests inside `describe("analytics token store", …)`:

```ts
  it("clears the token when the admin session generation changes", () => {
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });

    setAuthenticatedAdminSession("other-token", { ...PRINCIPAL, id: "admin-2" });

    expect(getAnalyticsAccessToken()).toBeNull();
    expect(getAnalyticsTokenSnapshot().status).toBe("disconnected");
  });

  it("tells mounted subscribers the moment the admin session is replaced", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAnalyticsToken(listener);
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });
    listener.mockClear();

    setAuthenticatedAdminSession("other-token", { ...PRINCIPAL, id: "admin-2" });

    expect(listener).toHaveBeenCalled();
    expect(getAnalyticsTokenSnapshot().status).toBe("disconnected");
    unsubscribe();
  });

  it("keeps the token across a same-principal refresh", () => {
    setAuthenticatedAdminSession("admin-token", PRINCIPAL);
    setAnalyticsAccessToken({ accessToken: "ga-token", expiresInSeconds: 3600 });

    setRefreshedAdminSession("rotated-admin-token", PRINCIPAL);

    expect(getAnalyticsAccessToken()).toBe("ga-token");
    expect(getAnalyticsTokenSnapshot().status).toBe("connected");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/analytics/analytics-token-store.test.ts`
Expected: FAIL — the first two tests still report `connected` / return `ga-token` because the store knows nothing about the admin session.

- [ ] **Step 3: Bind the analytics token to the admin session**

Edit `src/features/analytics/analytics-token-store.ts`. Add the import and the binding state at the top:

```ts
import {
  getAdminSessionGeneration,
  subscribeAccessToken,
} from "@/auth/store/admin-auth.store";
```

```ts
/**
 * 이 토큰은 화면이 아니라 관리자 세션에 묶인다.
 *
 * 예전에는 /super-admin/analytics를 벗어나면 토큰을 버렸다. 그래서 사용자 상세
 * 화면처럼 GA를 곁들여 쓰는 화면마다 다시 Google 동의 창을 띄워야 했다. 지금은
 * 탭이 살아 있는 동안 유지하되, 다른 관리자로 바뀌면 즉시 버린다 — 앞사람의
 * Google 권한으로 뒷사람이 보고서를 읽는 일이 없어야 한다.
 */
let boundAdminGeneration: number | null = null;
let unsubscribeAdminSession: (() => void) | null = null;

function adminSessionChanged(): boolean {
  return (
    boundAdminGeneration !== null &&
    boundAdminGeneration !== getAdminSessionGeneration()
  );
}
```

In `setAnalyticsAccessToken`, remember the generation right after `cancelExpiryTimer()`:

```ts
  cancelExpiryTimer();
  accessToken = token;
  boundAdminGeneration = getAdminSessionGeneration();
```

In `clearAnalyticsAccessToken`, release it:

```ts
export function clearAnalyticsAccessToken(
  reason: Exclude<AnalyticsTokenStatus, "connected"> = "disconnected",
): void {
  cancelExpiryTimer();
  accessToken = null;
  boundAdminGeneration = null;
  transition(reason, null);
}
```

Check on every read, before the expiry check:

```ts
/** Access tokens never leave this module except for the immediate API request. */
export function getAnalyticsAccessToken(): string | null {
  if (adminSessionChanged()) {
    clearAnalyticsAccessToken("disconnected");
    return null;
  }
  if (
    snapshot.status === "connected" &&
    snapshot.expiresAt !== null &&
    snapshot.expiresAt <= Date.now()
  ) {
    clearAnalyticsAccessToken("expired");
  }
  return accessToken;
}
```

Attach the eager listener while anyone is subscribed:

```ts
export function subscribeAnalyticsToken(listener: () => void): () => void {
  if (listeners.size === 0 && unsubscribeAdminSession === null) {
    unsubscribeAdminSession = subscribeAccessToken(() => {
      if (adminSessionChanged()) clearAnalyticsAccessToken("disconnected");
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeAdminSession?.();
      unsubscribeAdminSession = null;
    }
  };
}
```

And reset it for tests:

```ts
export function __resetAnalyticsTokenForTests(): void {
  cancelExpiryTimer();
  accessToken = null;
  boundAdminGeneration = null;
  unsubscribeAdminSession?.();
  unsubscribeAdminSession = null;
  listeners.clear();
  snapshot = {
    status: "disconnected",
    expiresAt: null,
    generation: 0,
  };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/features/analytics/analytics-token-store.test.ts`
Expected: PASS (6 tests — the 3 original plus the 3 new)

- [ ] **Step 5: Create the query keys and the event labels**

Create `src/features/analytics/analytics-query-keys.ts`:

```ts
import type { AnalyticsDateRange, AnalyticsReportView } from "./types";
import type { UserBehaviorRange } from "./user-behavior-report";

/**
 * One key factory for every GA-backed query.
 *
 * `all` is a prefix of every other key, so cancelling and removing it when the
 * token goes away really does drop every cached Google response — an alias key
 * defined somewhere else would keep one alive past the disconnect.
 *
 * `generation` is the token store's non-secret counter: a reconnect produces a
 * new generation, so a fresh grant never reads the previous grant's cache.
 */
export const analyticsQueryKeys = {
  all: ["google-analytics"] as const,
  report: (
    generation: number,
    propertyId: string,
    view: AnalyticsReportView,
    range: AnalyticsDateRange,
  ) => ["google-analytics", generation, propertyId, view, range] as const,
  userBehavior: (
    generation: number,
    propertyId: string,
    userId: string,
    range: UserBehaviorRange,
  ) =>
    [
      "google-analytics",
      "user-behavior",
      generation,
      propertyId,
      userId,
      range,
    ] as const,
};
```

Create `src/features/analytics/analytics-labels.ts`:

```ts
/**
 * GA4 이벤트 이름의 한국어 라벨.
 *
 * 이 목록은 Dopa 앱이 실제로 보내는 이름과 GA4가 자동 수집하는 이름만 담는다.
 * 존재하지 않는 이벤트에 라벨을 달아두면, 운영자는 "구매"라는 줄이 안 보이는
 * 이유를 앱이 아니라 이 화면에서 찾게 된다. 모르는 이름은 원문 그대로 둔다.
 */
export const EVENT_LABELS: Record<string, string> = {
  screen_view: "화면 조회",
  page_view: "페이지 조회",
  api_mutation: "데이터 변경",
  login_started: "로그인 시작",
  login_completed: "로그인 완료",
  login_canceled: "로그인 취소",
  login_failed: "로그인 실패",
  logout_started: "로그아웃 시작",
  logout_completed: "로그아웃 완료",
  signup_completed: "가입 완료",
  banner_click: "배너 클릭",
  app_cta_click: "앱 설치 유도 클릭",
  notification_opened: "알림 열기",
  notification_permission: "알림 권한",
  loading_stalled: "로딩 지연",
  chat_generation_mismatch: "채팅 세션 불일치",
  chat_realtime_recovered: "채팅 실시간 복구",
  withdraw_started: "탈퇴 시작",
  withdraw_completed: "탈퇴 완료",
  first_open: "첫 실행",
  first_visit: "첫 방문",
  session_start: "세션 시작",
  user_engagement: "참여",
  app_remove: "앱 삭제",
  os_update: "OS 업데이트",
  app_update: "앱 업데이트",
};
```

- [ ] **Step 6: Move the shared states into `AnalyticsStates.tsx`**

Create `src/features/analytics/AnalyticsStates.tsx`. Every function body below is moved **verbatim** from `AnalyticsDashboard.tsx` — `StatusCard` from lines 319-342, `ConnectionFact` from 344-351, `AnalyticsErrorState` from 475-498, `errorPresentation` from 500-529 (one new branch), `DataQualityPanel` from 720-750, `dataQualityDescription` from 752-769, `samplingPercentage` from 771-781, `formatIntegerString` from 783-789, `QuotaFooter` from 800-815:

```tsx
import { AlertCircle, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { AnalyticsDataApiError } from "./analytics-data-api";
import type { AnalyticsDataQualityNotice, AnalyticsQuotaState } from "./types";

export function StatusCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        <CardDescription className="max-w-2xl leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function ConnectionFact({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

export function AnalyticsErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const apiError = error instanceof AnalyticsDataApiError ? error : null;
  const presentation = errorPresentation(apiError);
  return (
    <Card className="border-destructive/30" role="alert" aria-live="assertive">
      <CardContent className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">{presentation.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {presentation.description}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={retry}>
          <RefreshCw /> 다시 시도
        </Button>
      </CardContent>
    </Card>
  );
}

export function errorPresentation(error: AnalyticsDataApiError | null): {
  title: string;
  description: string;
} {
  if (error?.kind === "unknown-field") {
    return {
      title: "GA4에 사용자 식별 측정기준이 아직 없어요",
      description:
        "GA4 맞춤 정의에 사용자 범위 맞춤 측정기준 dopa_uid를 등록하면 조회할 수 있습니다.",
    };
  }
  if (error?.kind === "permission") {
    return {
      title: "GA4 속성 권한이 없습니다.",
      description: "연결한 Google 계정에 이 속성의 Viewer 이상 권한이 있는지 확인해 주세요.",
    };
  }
  if (error?.kind === "quota") {
    const retry = error.retryAfterMs
      ? ` 약 ${Math.ceil(error.retryAfterMs / 1_000)}초 후 다시 시도할 수 있습니다.`
      : " 잠시 후 다시 시도해 주세요.";
    return {
      title: "GA API 할당량을 모두 사용했습니다.",
      description: `데이터를 임의 값으로 대체하지 않았습니다.${retry}`,
    };
  }
  if (error?.kind === "invalid-response" || error?.kind === "request") {
    return {
      title: "보고서 정의를 처리하지 못했습니다.",
      description: "GA4 맞춤 정의와 dimension·metric 호환성을 확인해 주세요.",
    };
  }
  return {
    title: "Google Analytics 보고서를 불러오지 못했습니다.",
    description: "연결 상태를 확인한 뒤 다시 시도해 주세요. 다른 관리자 기능에는 영향을 주지 않습니다.",
  };
}

export function DataQualityPanel({
  notices,
}: {
  notices: AnalyticsDataQualityNotice[];
}) {
  if (notices.length === 0) return null;
  return (
    <section
      aria-labelledby="analytics-data-quality-title"
      className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground"
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground">
          <TriangleAlert className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id="analytics-data-quality-title" className="font-semibold">
            데이터 품질 안내
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            GA4가 반환한 보고서별 품질 신호입니다. 아래 제한을 고려해 수치를 해석해 주세요.
          </p>
          <ul className="mt-3 space-y-2">
            {notices.map((notice, index) => (
              <li key={`${notice.reportKey}:${notice.kind}:${index}`} className="leading-6">
                <span className="font-medium">{notice.reportTitle}</span>
                <span className="text-muted-foreground"> · {dataQualityDescription(notice)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function dataQualityDescription(notice: AnalyticsDataQualityNotice): string {
  if (notice.kind === "thresholding") {
    return "개인정보 보호 임계값이 적용되어 소규모 사용자 행이 제외되었을 수 있습니다.";
  }
  if (notice.kind === "other-row") {
    return "고유값이 많은 차원의 일부 값이 (other) 행으로 합쳐졌습니다.";
  }
  const percentage = samplingPercentage(
    notice.samplesReadCount,
    notice.samplingSpaceSize,
  );
  const counts = `${formatIntegerString(notice.samplesReadCount)} / ${formatIntegerString(
    notice.samplingSpaceSize,
  )}개 이벤트`;
  return percentage
    ? `${counts}를 사용한 표본 보고서입니다 (${percentage}).`
    : `${counts}를 사용한 표본 보고서입니다.`;
}

function samplingPercentage(samplesReadCount: string, samplingSpaceSize: string): string | null {
  try {
    const samples = BigInt(samplesReadCount);
    const space = BigInt(samplingSpaceSize);
    if (samples < 0n || space <= 0n) return null;
    const tenthsOfPercent = (samples * 1_000n + space / 2n) / space;
    return `${(Number(tenthsOfPercent) / 10).toFixed(1)}%`;
  } catch {
    return null;
  }
}

function formatIntegerString(value: string): string {
  try {
    return BigInt(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

export function QuotaFooter({ quota }: { quota: AnalyticsQuotaState | null }) {
  if (!quota || quota.entries.length === 0) return null;
  return (
    <details className="rounded-lg border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">GA API 할당량 상태</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {quota.entries.map((entry) => (
          <li key={entry.key} className="flex justify-between gap-3">
            <span>{entry.key}</span>
            <span className="tabular-nums">잔여 {entry.remaining.toLocaleString("ko-KR")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

`QuotaFooter`'s prop was typed `AnalyticsReportResult["quota"]` in the dashboard; that resolves to `AnalyticsQuotaState | null`, so naming the type directly here is the same type with one fewer indirection.

- [ ] **Step 7: Move the connection lifecycle into `use-analytics-connection.ts`**

Create `src/features/analytics/use-analytics-connection.ts`. The bodies of `connect` and `disconnect` are moved verbatim from `AnalyticsDashboard.tsx:144-166`; the GIS preload effect from 118-122; the cancel/remove effect from 124-130; the `mountedRef` half of 132-139 (**the token clearing on lines 136-137 is deliberately not moved — that is the one behaviour change in this task**):

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { analyticsQueryKeys } from "./analytics-query-keys";
import {
  clearAnalyticsAccessToken,
  setAnalyticsAccessToken,
  type AnalyticsTokenSnapshot,
} from "./analytics-token-store";
import {
  GoogleAnalyticsOAuthError,
  loadGoogleAnalyticsIdentityServices,
  requestGoogleAnalyticsToken,
} from "./google-analytics-oauth";
import { useAnalyticsToken } from "./use-analytics-token";

export type AnalyticsConnection = {
  token: AnalyticsTokenSnapshot;
  connecting: boolean;
  connectionError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

/**
 * GA 연결 하나를 여러 화면이 나눠 쓴다.
 *
 * 언마운트할 때 토큰을 버리지 않는다. 분석 화면과 사용자 상세 화면을 오갈
 * 때마다 Google 동의 창이 다시 뜨면, 운영자는 조사를 멈추고 팝업을 처리한다.
 * 토큰의 수명은 관리자 세션이 쥐고 있다(analytics-token-store).
 */
export function useAnalyticsConnection({
  googleClientId,
  enabled,
}: {
  googleClientId: string;
  enabled: boolean;
}): AnalyticsConnection {
  const queryClient = useQueryClient();
  const token = useAnalyticsToken();
  const mountedRef = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled && googleClientId.trim()) {
      void loadGoogleAnalyticsIdentityServices().catch(() => undefined);
    }
  }, [enabled, googleClientId]);

  useEffect(() => {
    if (token.status !== "connected") {
      void queryClient.cancelQueries({ queryKey: analyticsQueryKeys.all }).then(() => {
        queryClient.removeQueries({ queryKey: analyticsQueryKeys.all });
      });
    }
  }, [queryClient, token.status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const grant = await requestGoogleAnalyticsToken(googleClientId);
      // A grant that lands after the screen is gone is not this screen's to keep.
      if (!mountedRef.current) return;
      setAnalyticsAccessToken(grant);
    } catch (reason) {
      if (!mountedRef.current) return;
      setConnectionError(
        reason instanceof GoogleAnalyticsOAuthError
          ? reason.message
          : "Google Analytics 연결을 완료하지 못했습니다.",
      );
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }, [googleClientId]);

  const disconnect = useCallback((): void => {
    clearAnalyticsAccessToken("disconnected");
    queryClient.removeQueries({ queryKey: analyticsQueryKeys.all });
  }, [queryClient]);

  return { token, connecting, connectionError, connect, disconnect };
}
```

- [ ] **Step 8: Rewire `AnalyticsDashboard.tsx`**

In `src/features/analytics/AnalyticsDashboard.tsx`:

1. Replace the import block (lines 1-57) with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock3,
  Database,
  Link2,
  Loader2,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { EVENT_LABELS } from "./analytics-labels";
import { analyticsQueryKeys } from "./analytics-query-keys";
import { fetchAnalyticsReport } from "./analytics-reports";
import {
  AnalyticsErrorState,
  ConnectionFact,
  DataQualityPanel,
  QuotaFooter,
  StatusCard,
} from "./AnalyticsStates";
import {
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
} from "./analytics-token-store";
import type {
  AnalyticsDateRange,
  AnalyticsMetricValue,
  AnalyticsPropertyConfig,
  AnalyticsReportColumn,
  AnalyticsReportResult,
  AnalyticsReportTable,
  AnalyticsReportView,
} from "./types";
import { useAnalyticsConnection } from "./use-analytics-connection";
```

2. Delete the local `analyticsQueryKeys` (lines 65-73) and the local `EVENT_LABELS` (lines 89-102).

3. Replace the component's state and effects (lines 109-166) with:

```tsx
  const configured = !configError && properties.length > 0;
  const { token, connecting, connectionError, connect, disconnect } =
    useAnalyticsConnection({ googleClientId, enabled: configured });
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [view, setView] = useState<AnalyticsReportView>("overview");
  const [range, setRange] = useState<AnalyticsDateRange>("28d");

  const selectedProperty =
    properties.find((property) => property.id === propertyId) ?? properties[0];
```

4. Change the 보관 fact (line 204) and the disconnect button label (line 262):

```tsx
            <ConnectionFact title="보관" value="이 탭의 메모리에만 유지 · 로그아웃 시 삭제" />
```

```tsx
        <Button variant="outline" onClick={disconnect}>
          <Unplug /> 연결 끊기
        </Button>
```

5. Delete `StatusCard` (319-342), `ConnectionFact` (344-351), `AnalyticsErrorState` (475-498), `errorPresentation` (500-529), `DataQualityPanel` (720-750), `dataQualityDescription` (752-769), `samplingPercentage` (771-781), `formatIntegerString` (783-789) and `QuotaFooter` (800-815) — they now live in `AnalyticsStates.tsx`.

Everything else in the file — `AnalyticsPageFrame`, `AnalyticsQueryView`, `AnalyticsLoadingState`, `reportCompletionSummary`, `AnalyticsEmptyState`, `AnalyticsReportContent`, `MetricGrid`, `TrendPanel`, `AnalyticsTable`, `tableRowCountLabel`, `formatCell`, `formatMetric`, `percentChange`, `formatGaDate`, `platformLabel`, `VIEW_OPTIONS`, `DATE_RANGE_OPTIONS` — stays exactly as it is.

- [ ] **Step 9: Invert the one dashboard test the lifecycle change makes false**

In `src/features/analytics/AnalyticsDashboard.test.tsx`, replace the test at lines 346-354 with:

```tsx
  it("keeps the Google token when the analytics route unmounts so a sibling screen can reuse it", () => {
    setAnalyticsAccessToken({ accessToken: "session-scoped", expiresInSeconds: 3600 });
    vi.mocked(fetchAnalyticsReport).mockResolvedValue(emptyOverview());
    const { unmount } = renderDashboard();

    unmount();

    // Route-scoped clearing meant every screen that shows GA data re-opened the
    // Google consent popup. The token's life is the admin session's now.
    expect(getAnalyticsAccessToken()).toBe("session-scoped");
  });
```

The neighbouring test — "discards an OAuth grant that arrives after the analytics route unmounts" — must stay and must stay green: the `mountedRef` guard moved into the hook still discards a late grant.

- [ ] **Step 10: Run the whole analytics suite**

Run: `npx vitest run src/features/analytics`
Expected: PASS. Every `AnalyticsDashboard.test.tsx` assertion other than the inverted one is unchanged; if any other one fails, the extraction changed behaviour.

- [ ] **Step 11: Lint and boundary check**

Run: `npm run lint && npm run check:admin-runtime`
Expected: no errors (watch for unused imports left behind in `AnalyticsDashboard.tsx` — `AlertCircle`, `RefreshCw` and `TriangleAlert` must be gone).

- [ ] **Step 12: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD
git add src/features/analytics/analytics-token-store.ts \
        src/features/analytics/analytics-token-store.test.ts \
        src/features/analytics/analytics-query-keys.ts \
        src/features/analytics/analytics-labels.ts \
        src/features/analytics/AnalyticsStates.tsx \
        src/features/analytics/use-analytics-connection.ts \
        src/features/analytics/AnalyticsDashboard.tsx \
        src/features/analytics/AnalyticsDashboard.test.tsx
git commit -m "$(cat <<'MSG'
refactor(analytics): bind the Google token to the admin session and share the states

The access token was scoped to the analytics route: leaving it threw the grant
away, so any second screen that shows GA data would re-open Google's consent
popup mid-investigation. It is now bound to the admin session generation —
still memory-only, still gone on reload, and dropped the moment a different
administrator takes over the tab.

The connection lifecycle, the status/error/quality/quota cards, the query keys
and the event labels move out of AnalyticsDashboard so the user detail screen
uses one copy. The event label map now lists the events the app actually sends.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 4: `UserBehaviorPanel` — the lazily-loaded GA section

**Files:**
- Create: `src/features/analytics/use-user-behavior-query.ts`
- Create: `src/features/analytics/UserBehaviorPanel.tsx`
- Test: `src/features/analytics/UserBehaviorPanel.test.tsx`

**Interfaces:**
- Consumes (Task 2): `fetchUserBehaviorFlow`, `pickUserBehaviorProperty`, `formatFlowDay`, `formatFlowMinute`, `USER_BEHAVIOR_RANGES`, types `UserBehaviorFlow`, `UserBehaviorRange`, `UserBehaviorSession`, `UserBehaviorEvent`. (Task 3): `analyticsQueryKeys.userBehavior`, `useAnalyticsConnection`, `AnalyticsErrorState`, `ConnectionFact`, `DataQualityPanel`, `QuotaFooter`, `EVENT_LABELS`. Existing: `AnalyticsDataApiError`, `getAnalyticsAccessToken`, `clearAnalyticsAccessToken`, `AnalyticsPropertyConfig`.
- Produces, for Task 5:
  - `useUserBehaviorQuery({ property, userId, range, generation }): UseQueryResult<UserBehaviorFlow, Error>`
  - `UserBehaviorPanel(props: UserBehaviorPanelProps)` where
    `type UserBehaviorPanelProps = { userId: string; nickname: string; properties: AnalyticsPropertyConfig[]; googleClientId: string; configError: string | null }`
    — this exact prop shape is what `UserDetailPage` passes through `createRetryableLazyComponent`.

Read first: `src/features/analytics/AnalyticsDashboard.tsx:353-437` (`AnalyticsQueryView` — the "queryFn reads the token, an effect clears it on `expired`, an sr-only `role="status"` announces loading" shape this panel repeats) and `:265-284` (the `aria-pressed` chip group the range switch copies).

- [ ] **Step 1: Write the failing panel test**

Create `src/features/analytics/UserBehaviorPanel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsDataApiError } from "./analytics-data-api";
import {
  __resetAnalyticsTokenForTests,
  getAnalyticsAccessToken,
  setAnalyticsAccessToken,
} from "./analytics-token-store";

vi.mock("./google-analytics-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-analytics-oauth")>();
  return {
    ...actual,
    loadGoogleAnalyticsIdentityServices: vi.fn().mockResolvedValue(undefined),
    requestGoogleAnalyticsToken: vi.fn(),
  };
});

vi.mock("./user-behavior-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./user-behavior-report")>();
  return { ...actual, fetchUserBehaviorFlow: vi.fn() };
});

import { requestGoogleAnalyticsToken } from "./google-analytics-oauth";
import {
  fetchUserBehaviorFlow,
  shapeUserBehaviorRows,
  type UserBehaviorFlow,
  type UserBehaviorRow,
} from "./user-behavior-report";
import { UserBehaviorPanel } from "./UserBehaviorPanel";

const properties = [
  { id: "1234", label: "Dopa Web", platform: "web" as const },
  { id: "5678", label: "Dopa App", platform: "mixed" as const },
];

function emptyFlow(overrides: Partial<UserBehaviorFlow> = {}): UserBehaviorFlow {
  return {
    timeZone: "Asia/Seoul",
    sessions: [],
    totals: { sessions: 0, events: 0, screenViews: 0 },
    dataQualityNotices: [],
    quota: null,
    rowCount: 0,
    truncated: false,
    isEmpty: true,
    ...overrides,
  };
}

function row(
  dateHourMinute: string,
  eventName: string,
  unifiedScreenName: string,
  eventCount = 1,
): UserBehaviorRow {
  return {
    dateHourMinute,
    eventName,
    unifiedScreenName,
    platform: "iOS",
    eventCount,
  };
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof UserBehaviorPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserBehaviorPanel
        userId="user-1"
        nickname="민정"
        properties={properties}
        googleClientId="public-client-id"
        configError={null}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe("UserBehaviorPanel", () => {
  beforeEach(() => {
    __resetAnalyticsTokenForTests();
    vi.mocked(fetchUserBehaviorFlow).mockReset();
    vi.mocked(requestGoogleAnalyticsToken).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("says what is missing instead of offering a connection that cannot work", () => {
    renderPanel({ properties: [], configError: "GA4 속성이 설정되지 않았습니다." });

    expect(screen.getByRole("heading", { name: "GA4 설정 필요" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Google Analytics 연결" }),
    ).not.toBeInTheDocument();
    expect(fetchUserBehaviorFlow).not.toHaveBeenCalled();
  });

  it("asks for an explicit connection before touching Google", async () => {
    const user = userEvent.setup();
    vi.mocked(requestGoogleAnalyticsToken).mockResolvedValue({
      accessToken: "memory-only-token",
      expiresInSeconds: 3600,
    });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(emptyFlow());
    renderPanel();

    expect(fetchUserBehaviorFlow).not.toHaveBeenCalled();
    expect(screen.getByText("analytics.readonly만 요청")).toBeInTheDocument();
    expect(
      screen.getByText("이 탭의 메모리에만 유지 · 로그아웃 시 삭제"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Google Analytics 연결" }));

    expect(await screen.findByText("아직 수집된 행동이 없어요")).toBeInTheDocument();
    // The app property, not the web one, and this user only.
    expect(fetchUserBehaviorFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        property: properties[1],
        userId: "user-1",
        range: "7d",
        accessToken: "memory-only-token",
      }),
    );
  });

  it("names the unregistered GA4 custom dimension instead of reporting a bad request", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockRejectedValue(
      new AnalyticsDataApiError("unknown-field", "no such dimension", {
        status: 400,
        apiMessage: "Field customUser:dopa_uid is not a valid dimension.",
      }),
    );
    renderPanel();

    expect(
      await screen.findByRole("heading", {
        name: "GA4에 사용자 식별 측정기준이 아직 없어요",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/맞춤 측정기준 만들기/)).toBeInTheDocument();
    expect(screen.getByText(/dopa_uid/)).toBeInTheDocument();
  });

  it("keeps the threshold warning visible when GA4 returns nothing", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(
      emptyFlow({
        dataQualityNotices: [
          {
            kind: "thresholding",
            reportKey: "user-behavior",
            reportTitle: "사용자 행동 흐름",
          },
        ],
      }),
    );
    renderPanel();

    expect(await screen.findByText("아직 수집된 행동이 없어요")).toBeInTheDocument();
    expect(screen.getByText(/임계값 때문에 표시되지 않을 수 있어요/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "데이터 품질 안내" }),
    ).toBeInTheDocument();
  });

  it("renders each session as a screen-by-screen flow with event chips", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(
      shapeUserBehaviorRows(
        [
          row("202609080930", "screen_view", "PartyDetail"),
          row("202609080931", "api_mutation", "PartyDetail", 2),
          row("202609080933", "screen_view", "Payment"),
        ],
        {
          timeZone: "Asia/Seoul",
          quota: null,
          dataQualityNotices: [],
          rowCount: 3,
          truncated: true,
        },
      ),
    );
    renderPanel();

    expect(await screen.findByText("PartyDetail")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("09:30–09:33")).toBeInTheDocument();
    expect(screen.getByText("지속 3분")).toBeInTheDocument();
    // Both screen visits carry one screen_view, so the chip text repeats.
    expect(screen.getAllByText("화면 조회 × 1")).toHaveLength(2);
    expect(screen.getByText("데이터 변경 × 2")).toBeInTheDocument();
    expect(screen.getByText(/최근 일부만 표시했습니다/)).toBeInTheDocument();
    expect(
      screen.getByText(/Asia\/Seoul 기준, GA4 처리 지연으로 최근 24–48시간은 누락될 수 있어요/),
    ).toBeInTheDocument();
  });

  it("re-queries when the operator widens the range", async () => {
    const user = userEvent.setup();
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockResolvedValue(emptyFlow());
    renderPanel();

    await screen.findByText("아직 수집된 행동이 없어요");
    const twentyEight = screen.getByRole("button", { name: "최근 28일" });
    expect(twentyEight).toHaveAttribute("aria-pressed", "false");

    await user.click(twentyEight);

    expect(twentyEight).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(fetchUserBehaviorFlow).toHaveBeenLastCalledWith(
        expect.objectContaining({ range: "28d" }),
      ),
    );
  });

  it("drops the stale grant when Google says the token expired", async () => {
    setAnalyticsAccessToken({ accessToken: "memory-token", expiresInSeconds: 3600 });
    vi.mocked(fetchUserBehaviorFlow).mockRejectedValue(
      new AnalyticsDataApiError("expired", "Google Analytics 연결이 만료되었습니다.", {
        status: 401,
      }),
    );
    renderPanel();

    expect(
      await screen.findByRole("heading", {
        name: "Google Analytics 연결이 만료되었습니다.",
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getAnalyticsAccessToken()).toBeNull());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/analytics/UserBehaviorPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./UserBehaviorPanel"`.

- [ ] **Step 3: Write the query hook**

Create `src/features/analytics/use-user-behavior-query.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { analyticsQueryKeys } from "./analytics-query-keys";
import {
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
} from "./analytics-token-store";
import type { AnalyticsPropertyConfig } from "./types";
import {
  fetchUserBehaviorFlow,
  type UserBehaviorFlow,
  type UserBehaviorRange,
} from "./user-behavior-report";

/**
 * 토큰은 queryFn 안에서만 읽는다. 컴포넌트 props나 쿼리 키에 실으면 React
 * DevTools, 오류 리포트, 쿼리 캐시 스냅숏에 그대로 남는다.
 */
export function useUserBehaviorQuery({
  property,
  userId,
  range,
  generation,
}: {
  property: AnalyticsPropertyConfig;
  userId: string;
  range: UserBehaviorRange;
  generation: number;
}) {
  const query = useQuery<UserBehaviorFlow, Error>({
    queryKey: analyticsQueryKeys.userBehavior(generation, property.id, userId, range),
    queryFn: ({ signal }) => {
      const accessToken = getAnalyticsAccessToken();
      if (!accessToken) {
        throw new AnalyticsDataApiError(
          "expired",
          "Google Analytics 연결이 만료되었습니다.",
        );
      }
      return fetchUserBehaviorFlow({ property, userId, range, accessToken, signal });
    },
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof AnalyticsDataApiError && query.error.kind === "expired") {
      clearAnalyticsAccessToken("expired");
    }
  }, [query.error]);

  return query;
}
```

- [ ] **Step 4: Write the panel**

Create `src/features/analytics/UserBehaviorPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  BarChart3,
  Clock3,
  Database,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { EVENT_LABELS } from "./analytics-labels";
import {
  AnalyticsErrorState,
  ConnectionFact,
  DataQualityPanel,
  QuotaFooter,
} from "./AnalyticsStates";
import type { AnalyticsPropertyConfig } from "./types";
import { useAnalyticsConnection } from "./use-analytics-connection";
import { useUserBehaviorQuery } from "./use-user-behavior-query";
import {
  formatFlowDay,
  formatFlowMinute,
  pickUserBehaviorProperty,
  type UserBehaviorEvent,
  type UserBehaviorRange,
  type UserBehaviorSession,
} from "./user-behavior-report";

/**
 * 한 사용자의 앱 행동 흐름.
 *
 * 서버 타임라인이 "무슨 일이 기록됐는가"라면 이 패널은 "그때 이 사람 화면에서
 * 무슨 일이 있었는가"다. 결제 실패 21:14 옆에 21:13 /payment가 보여야 조사가
 * 끝난다. 그래서 두 섹션은 같은 화면에서 나란히 스크롤된다.
 *
 * GA 코드는 이 청크에만 있다. 사용자 상세 라우트는 lazy import로만 이 파일에
 * 닿는다.
 */

export type UserBehaviorPanelProps = {
  userId: string;
  nickname: string;
  properties: AnalyticsPropertyConfig[];
  googleClientId: string;
  configError: string | null;
};

const RANGE_OPTIONS: Array<{ value: UserBehaviorRange; label: string }> = [
  { value: "7d", label: "최근 7일" },
  { value: "28d", label: "최근 28일" },
];

export function UserBehaviorPanel({
  userId,
  nickname,
  properties,
  googleClientId,
  configError,
}: UserBehaviorPanelProps) {
  const configured = !configError && properties.length > 0;
  const { token, connecting, connectionError, connect, disconnect } =
    useAnalyticsConnection({ googleClientId, enabled: configured });
  const [propertyId, setPropertyId] = useState(
    () => pickUserBehaviorProperty(properties)?.id ?? "",
  );
  const [range, setRange] = useState<UserBehaviorRange>("7d");
  const selectedProperty =
    properties.find((property) => property.id === propertyId) ??
    pickUserBehaviorProperty(properties);

  if (!configured || !selectedProperty) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-5">
        <div className="flex gap-3">
          <Database className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h3 className="font-medium">GA4 설정 필요</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {configError ??
                "NEXT_PUBLIC_GA4_PROPERTIES에 조회할 GA4 속성을 설정해 주세요."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (token.status !== "connected") {
    const expired = token.status === "expired";
    return (
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex gap-3">
          {expired ? (
            <Clock3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          )}
          <div className="min-w-0">
            <h3 className="font-medium">
              {expired
                ? "Google Analytics 연결이 만료되었습니다."
                : `${nickname} 님의 화면 흐름은 Google Analytics를 연결하면 보입니다`}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              읽기 전용 권한만 요청하고, 토큰은 Dopa 서버로 전송하지 않습니다.
            </p>
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border bg-muted/35 p-4 text-sm sm:grid-cols-3">
          <ConnectionFact title="권한" value="analytics.readonly만 요청" />
          <ConnectionFact title="보관" value="이 탭의 메모리에만 유지 · 로그아웃 시 삭제" />
          <ConnectionFact title="전송" value="Google Data API로 직접 요청" />
        </div>
        {connectionError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {connectionError}
          </p>
        ) : null}
        <Button onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Loader2 className="animate-spin" /> : <Link2 />}
          Google Analytics 연결
        </Button>
      </div>
    );
  }

  return (
    <UserBehaviorFlowView
      key={`${selectedProperty.id}:${range}:${token.generation}`}
      property={selectedProperty}
      properties={properties}
      userId={userId}
      range={range}
      generation={token.generation}
      onPropertyChange={setPropertyId}
      onRangeChange={setRange}
      onDisconnect={disconnect}
    />
  );
}

function UserBehaviorFlowView({
  property,
  properties,
  userId,
  range,
  generation,
  onPropertyChange,
  onRangeChange,
  onDisconnect,
}: {
  property: AnalyticsPropertyConfig;
  properties: AnalyticsPropertyConfig[];
  userId: string;
  range: UserBehaviorRange;
  generation: number;
  onPropertyChange: (propertyId: string) => void;
  onRangeChange: (range: UserBehaviorRange) => void;
  onDisconnect: () => void;
}) {
  const query = useUserBehaviorQuery({ property, userId, range, generation });
  const apiError = query.error instanceof AnalyticsDataApiError ? query.error : null;

  let content: React.ReactNode;
  if (query.isPending) {
    content = <BehaviorSkeleton />;
  } else if (query.isError) {
    content =
      apiError?.kind === "unknown-field" ? (
        <DimensionMissingState apiMessage={apiError.apiMessage} />
      ) : (
        <AnalyticsErrorState error={query.error} retry={() => void query.refetch()} />
      );
  } else if (query.data.isEmpty) {
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={query.data.dataQualityNotices} />
        <BehaviorEmptyState
          thresholded={query.data.dataQualityNotices.some(
            (notice) => notice.kind === "thresholding",
          )}
        />
        <QuotaFooter quota={query.data.quota} />
      </div>
    );
  } else {
    const flow = query.data;
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={flow.dataQualityNotices} />
        <dl className="grid grid-cols-3 gap-3 rounded-xl border bg-card p-4">
          <BehaviorTotal label="세션" value={flow.totals.sessions} />
          <BehaviorTotal label="이벤트" value={flow.totals.events} />
          <BehaviorTotal label="화면 조회" value={flow.totals.screenViews} />
        </dl>
        {flow.truncated ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            이벤트가 많아 최근 일부만 표시했습니다. 기간을 좁혀 다시 조회해 주세요.
          </p>
        ) : null}
        {flow.sessions.map((session) => (
          <BehaviorSessionCard key={session.id} session={session} />
        ))}
        <QuotaFooter quota={flow.quota} />
        <p className="text-xs leading-5 text-muted-foreground">
          {flow.timeZone} 기준, GA4 처리 지연으로 최근 24–48시간은 누락될 수 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {properties.length > 1 ? (
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              GA4 속성
              <select
                className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
                value={property.id}
                onChange={(event) => onPropertyChange(event.target.value)}
              >
                {properties.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div
            role="group"
            aria-label="행동 조회 기간"
            className="flex gap-1 rounded-lg border bg-muted/40 p-1"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                className={cn(
                  "min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  range === option.value && "bg-background text-foreground shadow-sm",
                )}
                onClick={() => onRangeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : undefined} />
            새로고침
          </Button>
          <Button variant="ghost" size="sm" onClick={onDisconnect}>
            <Unplug /> 연결 끊기
          </Button>
        </div>
      </div>
      {!query.isError ? (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={query.isPending ? "true" : undefined}
        >
          {query.isPending
            ? "사용자 행동 흐름을 불러오는 중입니다."
            : `세션 ${query.data?.totals.sessions ?? 0}개를 불러왔습니다.`}
        </p>
      ) : null}
      {content}
    </div>
  );
}

function BehaviorTotal({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">
        {value.toLocaleString("ko-KR")}
      </dd>
    </div>
  );
}

function BehaviorSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * GA4에 dopa_uid 맞춤 측정기준이 없을 때.
 *
 * 이건 오류가 아니라 아직 하지 않은 설정이다. "다시 시도"를 눌러도 달라지지
 * 않으므로 재시도 버튼 대신 해야 할 일을 순서대로 적는다.
 */
function DimensionMissingState({ apiMessage }: { apiMessage?: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm"
    >
      <div className="flex gap-3">
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0 text-warning-foreground"
          aria-hidden
        />
        <div className="min-w-0 space-y-2">
          <h3 className="font-medium">GA4에 사용자 식별 측정기준이 아직 없어요</h3>
          <ol className="list-decimal space-y-1 pl-5 leading-6 text-muted-foreground">
            <li>GA4 관리 → 맞춤 정의 → 맞춤 측정기준 만들기</li>
            <li>범위는 사용자, 사용자 속성은 dopa_uid</li>
            <li>앱은 로그인할 때 dopa_uid를 전송합니다</li>
            <li>등록한 이후에 수집된 이벤트부터 조회할 수 있습니다</li>
          </ol>
          {apiMessage ? (
            <p className="text-xs leading-5 text-muted-foreground">{apiMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BehaviorEmptyState({ thresholded }: { thresholded: boolean }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
      <BarChart3 className="mx-auto size-5 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">아직 수집된 행동이 없어요</p>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
        {thresholded
          ? "임계값 때문에 표시되지 않을 수 있어요. 위 데이터 품질 안내를 함께 확인해 주세요."
          : "dopa_uid가 등록된 이후 이 사용자가 앱을 사용하면 흐름이 여기에 표시됩니다."}
      </p>
    </div>
  );
}

function mergeVisitEvents(
  events: readonly UserBehaviorEvent[],
): Array<{ name: string; count: number }> {
  const merged = new Map<string, number>();
  for (const event of events) {
    merged.set(event.name, (merged.get(event.name) ?? 0) + event.count);
  }
  return [...merged].map(([name, count]) => ({ name, count }));
}

function BehaviorSessionCard({ session }: { session: UserBehaviorSession }) {
  const dayLabel = formatFlowDay(session.day);
  const start = formatFlowMinute(session.startMinute);
  const end = formatFlowMinute(session.endMinute);
  return (
    <section className="rounded-xl border bg-card" aria-label={`${dayLabel} ${start} 세션`}>
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <span className="font-medium tabular-nums">{dayLabel}</span>
        <span className="tabular-nums text-muted-foreground">{`${start}–${end}`}</span>
        <span className="text-muted-foreground">지속 {session.durationMinutes}분</span>
        <Badge variant="outline">{session.platform}</Badge>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {session.eventCount.toLocaleString("ko-KR")} 이벤트
        </span>
      </header>
      <ol className="divide-y">
        {session.screens.map((visit, index) => (
          <li
            key={`${session.id}:${visit.startMinute}:${index}`}
            className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-24">
              {`${formatFlowMinute(visit.startMinute)}–${formatFlowMinute(visit.endMinute)}`}
            </p>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{visit.screen}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {mergeVisitEvents(visit.events).map((event) => (
                  <Badge key={event.name} variant="outline" className="font-normal">
                    {`${EVENT_LABELS[event.name] ?? event.name} × ${event.count}`}
                  </Badge>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/features/analytics/UserBehaviorPanel.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 6: Confirm nothing else regressed**

Run: `npx vitest run src/features/analytics && npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD
git add src/features/analytics/use-user-behavior-query.ts \
        src/features/analytics/UserBehaviorPanel.tsx \
        src/features/analytics/UserBehaviorPanel.test.tsx
git commit -m "$(cat <<'MSG'
feat(analytics): show one user's app screen flow as sessions and screens

The panel reads GA4 in the browser, filtered to a single dopa_uid, and renders
sessions → screen visits → event chips rather than a table an operator would
have to re-sort in their head.

When the property has no dopa_uid custom dimension the panel says so and lists
the four setup steps: a retry button there would only fail again, and "요청을
처리하지 못했습니다" would send the operator looking for a bug in this app.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 5: The users feature and the `/super-admin/users/[id]` route

**Files:**
- Modify: `src/lib/format-date.ts` (add two formatters next to the existing three)
- Test: `src/lib/format-date.test.ts` (append one `it`)
- Create: `src/features/users/user-timeline-model.ts`
- Test: `src/features/users/user-timeline-model.test.ts`
- Create: `src/features/users/use-user-detail-query.ts`
- Create: `src/features/users/use-user-timeline-query.ts`
- Create: `src/features/users/UserDetailHeader.tsx`
- Create: `src/features/users/UserFlowTimeline.tsx`
- Test: `src/features/users/UserFlowTimeline.test.tsx`
- Create: `src/features/users/UserDetailPage.tsx`
- Test: `src/features/users/UserDetailPage.test.tsx`
- Create: `src/app/(super-admin)/super-admin/users/[id]/page.tsx`
- Test: `src/app/(super-admin)/super-admin/users/[id]/page.test.tsx`

**Interfaces:**
- Consumes (Task 1): `getAdminUser`, `getAdminUserSummary`, `getAdminUserTimeline`, `isAdminNotFound`, `isAdminForbidden`, `adminQueryKeys.users.*`, `ROUTE_SUPER_ADMIN_USERS`, `superAdminUserDetailPath`, `businessDetailPath`, `businessPartyDetailPath`, and the types `AdminUserDetail`, `AdminUserSummary`, `UserTimelineItem`, `UserTimelineRefs`, `UserTimelineCoverage`, `UserTimelinePage`.
  (Task 4): `UserBehaviorPanel` + `UserBehaviorPanelProps`.
  Existing: `createRetryableLazyComponent<Props>(loader, { loading, errorTitle })`; `useCursorAppendFocus<T>({ scopeKey, itemKeys, isFetchingNextPage, isFetchNextPageError, hasNextPage, focusMode?, viewKey? })` returning `{ beginAppend, setFallbackRef, setItemRef, setRetryButtonRef }`; `renderResourceValue(value, key)` from `@/components/admin/resource-console/formatters`; `ResourceActionDialog` + `PendingResourceAction`; `usersConfig`; `mutateAdminResource(path, method, body?)`; `dopaMediaUrl(url, { width })`; `formatDateTime`, `formatClockTime`.
- Produces, for Task 6: nothing new — Task 6 needs only `superAdminUserDetailPath` from Task 1.

Read first, and match these three patterns exactly:

1. `src/components/admin/AdminResourceConsole.tsx:136-147` — the cursor `useInfiniteQuery`:

```ts
  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listAdminResources(config.resource, {
        q: query,
        ...(status ? { status } : {}),
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
```

2. `src/components/admin/AdminResourceConsole.test.tsx:6-16` — the navigation mock every component test in this repo uses. `next/link` needs **no** mock: it renders a plain anchor in jsdom (verified in this repo's jsdom setup).

```ts
const navigation = vi.hoisted(() => ({
  pathname: "/super-admin/payments",
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));
```

None of the components in this task use `next/navigation`, so no navigation mock is needed — but if you add one, this is its shape.

3. `src/app/(super-admin)/super-admin/reports/page.tsx:317-351` — the "더 보기 + inline retry" pair, and `:124-135` for `useCursorAppendFocus` + `loadNextReportPage`.

- [ ] **Step 1: Write the failing date-format test**

Append to `src/lib/format-date.test.ts` inside `describe("format-date", ...)`:

```ts
  it("labels a Seoul day and a Seoul date without leaking the runtime zone", () => {
    // 23:59 KST on the 7th and 00:01 KST on the 8th are different days.
    expect(formatDayLabel("2026-09-07T14:59:00.000Z")).toContain("7");
    expect(formatDayLabel("2026-09-07T15:01:00.000Z")).toContain("8");
    expect(formatDayLabel("2026-09-07T15:01:00.000Z")).toMatch(/2026/);
    expect(formatDateOnly("2026-09-07T15:01:00.000Z")).toMatch(/2026/);
    expect(formatDayLabel("not-a-date")).toBe("—");
    expect(formatDateOnly("not-a-date")).toBe("—");
  });
```

and widen the import to:

```ts
import {
  formatClockTime,
  formatDateOnly,
  formatDateTime,
  formatDayLabel,
  formatPartyDate,
} from "./format-date";
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/format-date.test.ts`
Expected: FAIL with "formatDayLabel is not a function".

- [ ] **Step 3: Add the two formatters**

In `src/lib/format-date.ts`, after the `clockTime` formatter (line 27):

```ts
const dayLabel = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const dateOnly = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
```

and after `formatClockTime`:

```ts
/** Day heading for grouped activity, e.g. "2026년 9월 8일 화". */
export function formatDayLabel(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dayLabel.format(date) : "—";
}

/** Calendar day without a time, for range captions. */
export function formatDateOnly(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateOnly.format(date) : "—";
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/format-date.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing timeline-model test**

Create `src/features/users/user-timeline-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { UserTimelineItem } from "@/auth/api/admin-users.api";
import {
  TIMELINE_CATEGORIES,
  coverageSummaryText,
  filterTimelineItems,
  groupTimelineByDay,
  kindsForCategories,
  timelineFromIso,
  timelineKindLabel,
  timelineRefHref,
  timelineRefsOf,
} from "./user-timeline-model";

function item(overrides: Partial<UserTimelineItem>): UserTimelineItem {
  return {
    id: "e1",
    at: "2026-09-08T02:00:00.000Z",
    kind: "PAYMENT_PAID",
    category: "PAYMENT",
    title: "결제 완료",
    detail: null,
    refs: {},
    status: null,
    amount: null,
    meta: {},
    source: "db",
    ...overrides,
  };
}

describe("groupTimelineByDay", () => {
  it("splits at Seoul midnight, not UTC midnight", () => {
    const groups = groupTimelineByDay([
      item({ id: "a", at: "2026-09-07T15:01:00.000Z" }), // 00:01 KST on 9/8
      item({ id: "b", at: "2026-09-07T14:59:00.000Z" }), // 23:59 KST on 9/7
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.day).toBe("2026-09-08");
    expect(groups[0]?.label).toContain("8");
    expect(groups[1]?.day).toBe("2026-09-07");
    expect(groups[1]?.items.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("keeps the server's newest-first order inside a day", () => {
    const groups = groupTimelineByDay([
      item({ id: "a", at: "2026-09-08T05:00:00.000Z" }),
      item({ id: "b", at: "2026-09-08T04:00:00.000Z" }),
      item({ id: "c", at: "2026-09-08T03:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a row whose timestamp cannot be read instead of dropping it", () => {
    const groups = groupTimelineByDay([item({ id: "a", at: "" })]);

    expect(groups[0]?.day).toBe("unknown");
    expect(groups[0]?.label).toBe("시각을 알 수 없는 활동");
  });
});

describe("kindsForCategories / filterTimelineItems", () => {
  it("sends no kind filter when nothing is selected", () => {
    expect(kindsForCategories([])).toBeUndefined();
    expect(filterTimelineItems([item({ id: "a" })], [])).toHaveLength(1);
  });

  it("expands a category into its backend kinds without duplicates", () => {
    const payment = TIMELINE_CATEGORIES.find((entry) => entry.value === "PAYMENT");
    const kinds = kindsForCategories(["PAYMENT", "PAYMENT"]);

    expect(kinds).toEqual([...(payment?.kinds ?? [])]);
    expect(new Set(kinds).size).toBe(kinds?.length);
  });

  it("filters on the server-supplied category so an unlisted kind is never hidden", () => {
    const rows = [
      item({ id: "a", category: "PAYMENT", kind: "PAYMENT_PAID" }),
      item({ id: "b", category: "PAYMENT", kind: "PAYMENT_SOMETHING_NEW" }),
      item({ id: "c", category: "SOCIAL", kind: "FOLLOW_CREATED" }),
    ];

    expect(filterTimelineItems(rows, ["PAYMENT"]).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("timelineRefsOf / timelineRefHref", () => {
  it("links the references that have a destination and leaves the rest inert", () => {
    const refs = timelineRefsOf({
      userId: "u2",
      businessId: "biz-1",
      partyId: "party-1",
      paymentId: "pay-1",
      refundId: "ref-1",
      reportId: "rep-1",
      applicationId: "app-1",
      targetId: "t-1",
    });

    const hrefs = Object.fromEntries(
      refs.map((ref) => [ref.kind, timelineRefHref(ref)]),
    );

    expect(hrefs.user).toBe("/super-admin/users/u2");
    expect(hrefs.business).toBe("/app/businesses/biz-1");
    expect(hrefs.party).toBe("/app/businesses/biz-1/parties/party-1");
    expect(hrefs.payment).toBe("/super-admin/payments?payments_q=pay-1");
    expect(hrefs.refund).toBe("/super-admin/payments?refunds_q=ref-1");
    // Reports have no per-id URL, and an application or a moderation target
    // does not carry enough type information to guess one.
    expect(hrefs.report).toBeNull();
    expect(hrefs.application).toBeNull();
    expect(hrefs.target).toBeNull();
  });

  it("refuses to build a party link without the owning business", () => {
    const [party] = timelineRefsOf({ partyId: "party-1" });

    expect(party?.kind).toBe("party");
    expect(party ? timelineRefHref(party) : "unreachable").toBeNull();
  });

  it("returns nothing for a row with no references", () => {
    expect(timelineRefsOf(undefined)).toEqual([]);
    expect(timelineRefsOf({})).toEqual([]);
  });
});

describe("timelineFromIso", () => {
  it("turns a period into an absolute start and leaves 전체 unbounded", () => {
    const now = Date.parse("2026-09-08T00:00:00.000Z");

    expect(timelineFromIso("7d", now)).toBe("2026-09-01T00:00:00.000Z");
    expect(timelineFromIso("28d", now)).toBe("2026-08-11T00:00:00.000Z");
    expect(timelineFromIso("all", now)).toBeNull();
  });
});

describe("coverageSummaryText", () => {
  it("names the window and the categories the server actually covered", () => {
    const text = coverageSummaryText({
      from: "2026-08-11T00:00:00.000Z",
      asOf: "2026-09-08T00:00:00.000Z",
      coverage: [
        {
          category: "SESSION",
          source: "audit",
          retainedFrom: null,
          note: "접속 기록은 90일만 보관합니다.",
        },
        {
          category: "PAYMENT",
          source: "db",
          retainedFrom: null,
          note: "정산 확정 전 금액입니다.",
        },
      ],
      categories: [],
    });

    expect(text).toContain("기간의");
    expect(text).toContain("접속");
    expect(text).toContain("결제");
    expect(text).toMatch(/를 포함합니다$/);
  });

  it("falls back to the selected chips, then to every category", () => {
    const base = { from: null, asOf: null, coverage: [] };

    expect(coverageSummaryText({ ...base, categories: ["PARTY"] })).toContain("파티");
    expect(coverageSummaryText({ ...base, categories: [] })).toContain("계정");
    expect(coverageSummaryText({ ...base, categories: [] })).toContain("서비스 시작");
  });
});

describe("timelineKindLabel", () => {
  it("falls back to the raw kind so a new backend event is still readable", () => {
    expect(timelineKindLabel("PAYMENT_PAID")).toBe("결제 완료");
    expect(timelineKindLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run src/features/users/user-timeline-model.test.ts`
Expected: FAIL with "Failed to resolve import ./user-timeline-model".

- [ ] **Step 7: Write `user-timeline-model.ts`**

Create `src/features/users/user-timeline-model.ts`:

```ts
import {
  Ban,
  Bell,
  CalendarCheck,
  Circle,
  CreditCard,
  Flag,
  LogIn,
  MessageCircle,
  Receipt,
  ShieldAlert,
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
 */

export const TIMELINE_CATEGORIES = [
  {
    value: "ACCOUNT",
    label: "계정",
    kinds: [
      "USER_SIGNUP",
      "USER_PROFILE_UPDATED",
      "USER_CONSENT_AGREED",
      "USER_WITHDRAW_REQUESTED",
      "USER_WITHDRAWN",
    ],
  },
  {
    value: "SESSION",
    label: "접속",
    kinds: [
      "SESSION_CREATED",
      "SESSION_REFRESHED",
      "SESSION_REVOKED",
      "PUSH_TOKEN_REGISTERED",
    ],
  },
  {
    value: "PARTY",
    label: "파티",
    kinds: [
      "PARTY_APPLIED",
      "PARTY_APPLICATION_APPROVED",
      "PARTY_APPLICATION_REJECTED",
      "PARTY_APPLICATION_CANCELLED",
      "PARTY_CHECKED_IN",
      "PARTY_REVIEW_POSTED",
    ],
  },
  {
    value: "PAYMENT",
    label: "결제",
    kinds: [
      "PAYMENT_CREATED",
      "PAYMENT_PAID",
      "PAYMENT_FAILED",
      "PAYMENT_CANCELLED",
      "REFUND_REQUESTED",
      "REFUND_COMPLETED",
      "COUPON_ISSUED",
      "COUPON_USED",
    ],
  },
  {
    value: "SOCIAL",
    label: "소셜",
    kinds: [
      "FOLLOW_CREATED",
      "FOLLOW_REMOVED",
      "CHAT_ROOM_JOINED",
      "USER_BLOCKED",
      "USER_UNBLOCKED",
    ],
  },
  {
    value: "MODERATION",
    label: "신고·제재",
    kinds: [
      "REPORT_FILED",
      "REPORT_RECEIVED",
      "REPORT_RESOLVED",
      "RESTRICTION_APPLIED",
      "RESTRICTION_LIFTED",
    ],
  },
  {
    value: "ADMIN",
    label: "관리자",
    kinds: [
      "ADMIN_USER_BANNED",
      "ADMIN_USER_UNBANNED",
      "ADMIN_USER_UPDATED",
      "ADMIN_NOTE_ADDED",
    ],
  },
  {
    value: "NOTIFICATION",
    label: "알림",
    kinds: [
      "NOTIFICATION_SENT",
      "NOTIFICATION_OPENED",
      "INQUIRY_CREATED",
      "INQUIRY_ANSWERED",
    ],
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  kinds: readonly string[];
}>;

export const TIMELINE_KIND_LABELS: Record<string, string> = {
  USER_SIGNUP: "가입",
  USER_PROFILE_UPDATED: "프로필 수정",
  USER_CONSENT_AGREED: "약관 동의",
  USER_WITHDRAW_REQUESTED: "탈퇴 요청",
  USER_WITHDRAWN: "탈퇴 완료",
  SESSION_CREATED: "로그인",
  SESSION_REFRESHED: "세션 갱신",
  SESSION_REVOKED: "세션 종료",
  PUSH_TOKEN_REGISTERED: "푸시 토큰 등록",
  PARTY_APPLIED: "파티 신청",
  PARTY_APPLICATION_APPROVED: "신청 승인",
  PARTY_APPLICATION_REJECTED: "신청 거절",
  PARTY_APPLICATION_CANCELLED: "신청 취소",
  PARTY_CHECKED_IN: "체크인",
  PARTY_REVIEW_POSTED: "후기 작성",
  PAYMENT_CREATED: "결제 시작",
  PAYMENT_PAID: "결제 완료",
  PAYMENT_FAILED: "결제 실패",
  PAYMENT_CANCELLED: "결제 취소",
  REFUND_REQUESTED: "환불 요청",
  REFUND_COMPLETED: "환불 완료",
  COUPON_ISSUED: "쿠폰 발급",
  COUPON_USED: "쿠폰 사용",
  FOLLOW_CREATED: "팔로우",
  FOLLOW_REMOVED: "팔로우 해제",
  CHAT_ROOM_JOINED: "채팅방 입장",
  USER_BLOCKED: "차단",
  USER_UNBLOCKED: "차단 해제",
  REPORT_FILED: "신고 접수",
  REPORT_RECEIVED: "피신고",
  REPORT_RESOLVED: "신고 처리",
  RESTRICTION_APPLIED: "제재 적용",
  RESTRICTION_LIFTED: "제재 해제",
  ADMIN_USER_BANNED: "관리자 정지",
  ADMIN_USER_UNBANNED: "관리자 정지 해제",
  ADMIN_USER_UPDATED: "관리자 수정",
  ADMIN_NOTE_ADDED: "관리자 메모",
  NOTIFICATION_SENT: "알림 발송",
  NOTIFICATION_OPENED: "알림 열기",
  INQUIRY_CREATED: "문의 등록",
  INQUIRY_ANSWERED: "문의 답변",
};

export const TIMELINE_KIND_ICONS: Record<string, LucideIcon> = {
  USER_SIGNUP: UserPlus,
  USER_PROFILE_UPDATED: UserRoundCog,
  USER_CONSENT_AGREED: CalendarCheck,
  USER_WITHDRAW_REQUESTED: UserMinus,
  USER_WITHDRAWN: UserMinus,
  SESSION_CREATED: LogIn,
  SESSION_REFRESHED: LogIn,
  SESSION_REVOKED: LogIn,
  PUSH_TOKEN_REGISTERED: Bell,
  PARTY_APPLIED: CalendarCheck,
  PARTY_APPLICATION_APPROVED: CalendarCheck,
  PARTY_APPLICATION_REJECTED: CalendarCheck,
  PARTY_APPLICATION_CANCELLED: CalendarCheck,
  PARTY_CHECKED_IN: CalendarCheck,
  PARTY_REVIEW_POSTED: MessageCircle,
  PAYMENT_CREATED: CreditCard,
  PAYMENT_PAID: CreditCard,
  PAYMENT_FAILED: CreditCard,
  PAYMENT_CANCELLED: Receipt,
  REFUND_REQUESTED: Undo2,
  REFUND_COMPLETED: Undo2,
  COUPON_ISSUED: Ticket,
  COUPON_USED: Ticket,
  FOLLOW_CREATED: Users,
  FOLLOW_REMOVED: Users,
  CHAT_ROOM_JOINED: MessageCircle,
  USER_BLOCKED: Ban,
  USER_UNBLOCKED: Ban,
  REPORT_FILED: Flag,
  REPORT_RECEIVED: Flag,
  REPORT_RESOLVED: Flag,
  RESTRICTION_APPLIED: ShieldAlert,
  RESTRICTION_LIFTED: ShieldAlert,
  ADMIN_USER_BANNED: ShieldAlert,
  ADMIN_USER_UNBANNED: ShieldAlert,
  ADMIN_USER_UPDATED: UserRoundCog,
  ADMIN_NOTE_ADDED: MessageCircle,
  NOTIFICATION_SENT: Bell,
  NOTIFICATION_OPENED: Bell,
  INQUIRY_CREATED: MessageCircle,
  INQUIRY_ANSWERED: MessageCircle,
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

export function timelineRefsOf(
  refs: UserTimelineRefs | undefined,
): TimelineRef[] {
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
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run src/features/users/user-timeline-model.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 9: Write the two query hooks**

Create `src/features/users/use-user-detail-query.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAdminUser,
  getAdminUserSummary,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/auth/api/admin-users.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";

export function useUserDetailQuery(userId: string) {
  return useQuery<AdminUserDetail, Error>({
    queryKey: adminQueryKeys.users.detail(userId),
    queryFn: () => getAdminUser(userId),
    // A 404 or a 403 will not become a 200 on the third attempt; retrying only
    // delays the message that tells the operator which of the two it was.
    retry: false,
    staleTime: 30_000,
  });
}

export function useUserSummaryQuery(
  userId: string,
  { enabled }: { enabled: boolean },
) {
  return useQuery<AdminUserSummary | null, Error>({
    queryKey: adminQueryKeys.users.summary(userId),
    queryFn: () => getAdminUserSummary(userId),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}
```

Create `src/features/users/use-user-timeline-query.ts`:

```ts
"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getAdminUserTimeline } from "@/auth/api/admin-users.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";

export type UserTimelineQueryFilters = {
  /** Chip selection; also the client-side filter after the rows arrive. */
  categories: readonly string[];
  /** Server-side hint derived from `categories`. */
  kinds: readonly string[] | undefined;
  from: string | null;
};

export function useUserTimelineQuery(
  userId: string,
  filters: UserTimelineQueryFilters,
) {
  return useInfiniteQuery({
    queryKey: adminQueryKeys.users.timeline(userId, {
      // Sorted and joined so toggling A then B caches the same page as B then A.
      categories: [...filters.categories].sort().join(","),
      from: filters.from ?? "",
    }),
    queryFn: ({ pageParam }) =>
      getAdminUserTimeline(userId, {
        ...(filters.kinds && filters.kinds.length > 0 ? { kinds: filters.kinds } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: false,
  });
}
```

- [ ] **Step 10: Write the failing timeline component test**

Create `src/features/users/UserFlowTimeline.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-users.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-users.api")>();
  return { ...actual, getAdminUserTimeline: vi.fn() };
});

import {
  getAdminUserTimeline,
  type UserTimelineItem,
  type UserTimelinePage,
} from "@/auth/api/admin-users.api";
import { UserFlowTimeline } from "./UserFlowTimeline";

function item(overrides: Partial<UserTimelineItem>): UserTimelineItem {
  return {
    id: "e1",
    at: "2026-09-08T02:00:00.000Z",
    kind: "PAYMENT_PAID",
    category: "PAYMENT",
    title: "결제 완료",
    detail: null,
    refs: {},
    status: null,
    amount: null,
    meta: {},
    source: "db",
    ...overrides,
  };
}

function page(
  items: UserTimelineItem[],
  nextCursor: string | null,
  coverage: UserTimelinePage["coverage"] = [],
): UserTimelinePage {
  return {
    user: { id: "u1", nickname: "민정", status: "ACTIVE", deletedAt: null },
    items,
    nextCursor,
    asOf: "2026-09-08T06:00:00.000Z",
    coverage,
  };
}

function renderTimeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserFlowTimeline userId="u1" />
    </QueryClientProvider>,
  );
}

describe("UserFlowTimeline", () => {
  beforeEach(() => {
    vi.mocked(getAdminUserTimeline).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("appends the next cursor page and hands keyboard focus to the first new row", async () => {
    vi.mocked(getAdminUserTimeline).mockImplementation(async (_userId, params = {}) => {
      if (params.cursor === "cursor-2") {
        return page(
          [item({ id: "e2", title: "환불 완료", kind: "REFUND_COMPLETED" })],
          null,
        );
      }
      return page([item({ id: "e1" })], "cursor-2");
    });
    const user = userEvent.setup();
    renderTimeline();

    expect(await screen.findByText("결제 완료")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    const appended = await screen.findByText("환불 완료");
    await waitFor(() => expect(appended.closest("li")).toHaveFocus());
    expect(screen.getByText("결제 완료")).toBeInTheDocument();
    // The default period is 28일, so `from` rides along with the cursor.
    expect(getAdminUserTimeline).toHaveBeenLastCalledWith("u1", {
      from: expect.any(String),
      cursor: "cursor-2",
    });
  });

  it("keeps the loaded rows and offers an inline retry when the next page fails", async () => {
    vi.mocked(getAdminUserTimeline).mockImplementation(async (_userId, params = {}) => {
      if (params.cursor === "cursor-2") throw new Error("next page unavailable");
      return page([item({ id: "e1" })], "cursor-2");
    });
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("결제 완료");
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("이미 불러온 활동은 그대로 유지했습니다");
    expect(screen.getByText("결제 완료")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "다음 페이지 다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
  });

  it("re-queries with the category's kinds when a chip is pressed", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(page([item({ id: "e1" })], null));
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("결제 완료");
    const chip = screen.getByRole("button", { name: "결제" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(getAdminUserTimeline).toHaveBeenLastCalledWith("u1", {
        from: expect.any(String),
        kinds: expect.arrayContaining(["PAYMENT_PAID", "REFUND_COMPLETED"]),
      }),
    );
  });

  it("tells an empty account apart from a filter that matched nothing", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(page([], null));
    renderTimeline();

    expect(await screen.findByText("표시할 활동이 없습니다")).toBeInTheDocument();
    cleanup();

    vi.mocked(getAdminUserTimeline).mockResolvedValue(
      page(
        [
          item({
            id: "e1",
            category: "SOCIAL",
            kind: "FOLLOW_CREATED",
            title: "팔로우",
          }),
        ],
        null,
      ),
    );
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("팔로우");
    await user.click(screen.getByRole("button", { name: "결제" }));

    expect(await screen.findByText("조건에 맞는 활동이 없습니다")).toBeInTheDocument();
  });

  it("shows what the window covers and every retention warning the server sent", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(
      page([item({ id: "e1" })], null, [
        {
          category: "SESSION",
          source: "audit",
          retainedFrom: "2026-06-10T00:00:00.000Z",
          note: "접속 기록은 90일만 보관합니다.",
        },
      ]),
    );
    renderTimeline();

    expect(await screen.findByText(/기간의/)).toHaveTextContent("를 포함합니다");
    expect(screen.getByText("접속 기록은 90일만 보관합니다.")).toBeInTheDocument();
  });

  it("links the references that resolve and shows the rest as plain labels", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(
      page(
        [
          item({
            id: "e1",
            detail: "카드 결제 승인",
            refs: { paymentId: "pay-1", reportId: "rep-1" },
          }),
        ],
        null,
      ),
    );
    renderTimeline();

    const row = (await screen.findByText("결제 완료")).closest("li");
    expect(row).not.toBeNull();
    const scope = within(row as HTMLElement);
    expect(scope.getByRole("link", { name: "결제 · pay-1" })).toHaveAttribute(
      "href",
      "/super-admin/payments?payments_q=pay-1",
    );
    expect(scope.queryByRole("link", { name: "신고 · rep-1" })).toBeNull();
    expect(scope.getByText("신고 · rep-1")).toBeInTheDocument();
    expect(scope.getByText("카드 결제 승인")).toBeInTheDocument();
    expect(scope.getByText("DB")).toBeInTheDocument();
  });

  it("drops the window bound when the period is set to 전체", async () => {
    vi.mocked(getAdminUserTimeline).mockResolvedValue(page([item({ id: "e1" })], null));
    const user = userEvent.setup();
    renderTimeline();

    await screen.findByText("결제 완료");
    await user.selectOptions(screen.getByLabelText("기간"), "all");

    await waitFor(() => expect(getAdminUserTimeline).toHaveBeenLastCalledWith("u1", {}));
  });
});
```

- [ ] **Step 11: Run it and watch it fail**

Run: `npx vitest run src/features/users/UserFlowTimeline.test.tsx`
Expected: FAIL with "Failed to resolve import ./UserFlowTimeline".

- [ ] **Step 12: Write `UserFlowTimeline.tsx`**

Create `src/features/users/UserFlowTimeline.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, TriangleAlert } from "lucide-react";
import type { UserTimelineItem } from "@/auth/api/admin-users.api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCursorAppendFocus } from "@/hooks/use-cursor-append-focus";
import { formatClockTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  TIMELINE_CATEGORIES,
  TIMELINE_PERIODS,
  TIMELINE_REF_LABELS,
  TIMELINE_SOURCE_LABELS,
  coverageSummaryText,
  filterTimelineItems,
  groupTimelineByDay,
  kindsForCategories,
  timelineCategoryLabel,
  timelineFromIso,
  timelineKindIcon,
  timelineKindLabel,
  timelineRefHref,
  timelineRefsOf,
  type TimelinePeriod,
} from "./user-timeline-model";
import { useUserTimelineQuery } from "./use-user-timeline-query";

export function UserFlowTimeline({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<readonly string[]>([]);
  const [period, setPeriod] = useState<TimelinePeriod>("28d");
  // Pinned per period: recomputing `from` on every render would change the
  // query key continuously and refetch forever.
  const from = useMemo(() => timelineFromIso(period, Date.now()), [period]);
  const kinds = useMemo(() => kindsForCategories(categories), [categories]);
  const timeline = useUserTimelineQuery(userId, { categories, kinds, from });

  const pages = timeline.data?.pages ?? [];
  const items = useMemo(
    () => pages.flatMap((entry) => entry.items),
    [pages],
  );
  const visibleItems = useMemo(
    () => filterTimelineItems(items, categories),
    [items, categories],
  );
  const groups = useMemo(() => groupTimelineByDay(visibleItems), [visibleItems]);
  const lastPage = pages.at(-1);

  const { beginAppend, setFallbackRef, setItemRef, setRetryButtonRef } =
    useCursorAppendFocus<HTMLLIElement>({
      scopeKey: `${userId} ${period} ${[...categories].sort().join(",")}`,
      itemKeys: visibleItems.map((entry) => entry.id),
      isFetchingNextPage: timeline.isFetchingNextPage,
      isFetchNextPageError: timeline.isFetchNextPageError,
      hasNextPage: Boolean(timeline.hasNextPage),
    });

  const loadNextPage = () => {
    beginAppend();
    void timeline.fetchNextPage();
  };

  const toggleCategory = (value: string) => {
    setCategories((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="플로우 분류" className="flex flex-wrap gap-1">
          {TIMELINE_CATEGORIES.map((category) => {
            const pressed = categories.includes(category.value);
            return (
              <button
                key={category.value}
                type="button"
                aria-pressed={pressed}
                className={cn(
                  "min-h-8 rounded-lg border px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  pressed && "border-primary/40 bg-primary/10 text-foreground",
                )}
                onClick={() => toggleCategory(category.value)}
              >
                {category.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="기간"
            className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
            value={period}
            onChange={(event) => setPeriod(event.target.value as TimelinePeriod)}
          >
            {TIMELINE_PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={timeline.isFetching}
            onClick={() => void timeline.refetch()}
          >
            <RefreshCw className={timeline.isFetching ? "animate-spin" : undefined} />
            새로고침
          </Button>
        </div>
      </div>

      {lastPage ? (
        <div className="rounded-xl border bg-muted/25 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            {coverageSummaryText({
              from,
              asOf: lastPage.asOf,
              coverage: lastPage.coverage,
              categories,
            })}
          </p>
          {lastPage.coverage.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {lastPage.coverage.map((entry, index) => (
                <li
                  key={`${entry.category}:${index}`}
                  className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2"
                >
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 leading-6">{entry.note}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {timeline.isPending ? (
        <TimelineSkeleton />
      ) : timeline.isError && items.length === 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
        >
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">활동을 불러오지 못했습니다.</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {timeline.error instanceof Error
                  ? timeline.error.message
                  : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void timeline.refetch()}
              >
                <RefreshCw /> 다시 시도
              </Button>
            </div>
          </div>
        </div>
      ) : visibleItems.length === 0 ? (
        <div
          ref={setFallbackRef}
          tabIndex={-1}
          className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <p className="font-medium">
            {items.length === 0 ? "표시할 활동이 없습니다" : "조건에 맞는 활동이 없습니다"}
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {items.length === 0
              ? "이 기간에 기록된 활동이 없습니다. 기간을 넓혀 다시 확인해 주세요."
              : "선택한 분류를 해제하면 나머지 활동이 다시 보입니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.day} className="space-y-1">
              <h3 className="text-xs font-semibold tracking-[0.04em] text-muted-foreground">
                {group.label}
              </h3>
              <ol className="divide-y rounded-xl border bg-card px-3">
                {group.items.map((entry) => (
                  <TimelineRow key={entry.id} item={entry} setItemRef={setItemRef} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {timeline.isFetchNextPageError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span>다음 활동을 불러오지 못했습니다. 이미 불러온 활동은 그대로 유지했습니다.</span>
          <Button
            ref={setRetryButtonRef}
            variant="outline"
            size="sm"
            disabled={timeline.isFetchingNextPage}
            onClick={loadNextPage}
          >
            <RefreshCw
              className={timeline.isFetchingNextPage ? "animate-spin" : undefined}
            />
            다음 페이지 다시 시도
          </Button>
        </div>
      ) : timeline.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={timeline.isFetchingNextPage}
            onClick={loadNextPage}
          >
            {timeline.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TimelineRow({
  item,
  setItemRef,
}: {
  item: UserTimelineItem;
  setItemRef: (key: string, node: HTMLLIElement | null) => void;
}) {
  const KindIcon = timelineKindIcon(item.kind);
  // The normalizer falls back to the raw kind when the server sends no title.
  const title = item.title === item.kind ? timelineKindLabel(item.kind) : item.title;
  const refs = timelineRefsOf(item.refs);

  return (
    <li
      ref={(node) => setItemRef(item.id, node)}
      tabIndex={-1}
      className="flex gap-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border bg-muted/50 text-muted-foreground"
        title={timelineKindLabel(item.kind)}
      >
        <KindIcon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatClockTime(item.at)}
          </span>
          <Badge variant="outline">{timelineCategoryLabel(item.category)}</Badge>
          <p className="min-w-0 font-medium">{title}</p>
          <span className="ml-auto text-xs text-muted-foreground">
            {TIMELINE_SOURCE_LABELS[item.source] ?? item.source}
          </span>
        </div>
        {item.detail ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {item.detail}
          </p>
        ) : null}
        {refs.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {refs.map((ref) => {
              const href = timelineRefHref(ref);
              const label = `${TIMELINE_REF_LABELS[ref.kind]} · ${ref.id}`;
              return href ? (
                <Link
                  key={`${ref.kind}:${ref.id}`}
                  href={href}
                  prefetch={false}
                  className="rounded-sm text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {label}
                </Link>
              ) : (
                <Badge
                  key={`${ref.kind}:${ref.id}`}
                  variant="outline"
                  className="font-mono font-normal"
                >
                  {label}
                </Badge>
              );
            })}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-xl border bg-card p-3">
          <div className="size-7 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 13: Run it and watch it pass**

Run: `npx vitest run src/features/users/UserFlowTimeline.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 14: Write the header**

Create `src/features/users/UserDetailHeader.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { AdminUserDetail, AdminUserSummary } from "@/auth/api/admin-users.api";
import { ROUTE_SUPER_ADMIN_USERS } from "@/auth/model/admin-routes";
import { renderResourceValue } from "@/components/admin/resource-console/formatters";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { dopaMediaUrl } from "@/lib/dopa-media-url";
import { formatDateTime } from "@/lib/format-date";

const APPLICATION_LABELS: Record<string, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
  CANCELLED: "취소",
  WAITLISTED: "대기열",
};

function deviceSummary(summary: AdminUserSummary): string {
  const named = summary.devices.sessions
    .slice(0, 3)
    .map((session) => [session.platform, session.appVersion].filter(Boolean).join(" "))
    .filter((label) => label.length > 0);
  const active = `활성 세션 ${summary.devices.activeSessionCount}개`;
  return named.length > 0 ? `${active} · ${named.join(", ")}` : active;
}

function activitySummary(counts: AdminUserSummary["counts"]): string {
  const applications = Object.entries(counts.applications)
    .map(([status, count]) => `${APPLICATION_LABELS[status] ?? status} ${count}`)
    .join(" · ");
  return [
    applications ? `신청 ${applications}` : null,
    `결제 ${counts.payments.paidCount}/${counts.payments.count}건`,
    counts.refunds.count > 0 ? `환불 ${counts.refunds.count}건` : null,
    `신고 접수 ${counts.reportsFiled}건`,
    counts.reportsReceived.total > 0
      ? `피신고 ${counts.reportsReceived.total}건(미처리 ${counts.reportsReceived.pending})`
      : null,
    counts.activeRestrictions.length > 0
      ? `제재 ${counts.activeRestrictions.length}건`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

function consentSummary(consent: AdminUserSummary["consent"]): string {
  if (!consent) return "기록 없음";
  const version = consent.termsVersion ?? "약관";
  const agreedAt = consent.agreedAt ? formatDateTime(consent.agreedAt) : "시각 미상";
  return `${version} · ${agreedAt} · 마케팅 ${consent.marketingOptIn ? "동의" : "미동의"}`;
}

export function UserDetailHeader({
  user,
  summary,
  summaryPending,
  withdrawn,
  actions,
}: {
  user: AdminUserDetail;
  summary: AdminUserSummary | null;
  summaryPending: boolean;
  withdrawn: boolean;
  actions: ReactNode;
}) {
  const avatarSrc = user.profileImage
    ? dopaMediaUrl(user.profileImage, { width: 80 })
    : null;

  return (
    <header className="space-y-4 border-b pb-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={ROUTE_SUPER_ADMIN_USERS}
          prefetch={false}
          className="rounded-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← 사용자 목록
        </Link>
        <nav aria-label="현재 위치" className="text-xs text-muted-foreground">
          사용자 / {user.nickname}
        </nav>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Avatar size="lg">
          {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
          <AvatarFallback>{user.nickname.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {user.nickname}
            </h1>
            {renderResourceValue(user.role, "role")}
            {renderResourceValue(user.status, "status")}
            {user.blocked ? (
              <Badge variant="outline" className="gap-1">
                <ShieldAlert aria-hidden /> 로그인 제한
              </Badge>
            ) : null}
            {withdrawn ? <Badge variant="outline">탈퇴</Badge> : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{user.id}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{user.email ?? "이메일 없음"}</span>
            {user.provider ? <Badge variant="outline">{user.provider}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      {summary ? (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="가입" value={user.createdAt ? formatDateTime(user.createdAt) : "—"} />
          <Fact label="수정" value={user.updatedAt ? formatDateTime(user.updatedAt) : "—"} />
          <Fact
            label="평점"
            value={user.averageRating === null ? "—" : user.averageRating.toFixed(1)}
          />
          <Fact
            label="마지막 활동"
            value={
              summary.profile.lastSeenAt
                ? formatDateTime(summary.profile.lastSeenAt)
                : "—"
            }
          />
          <Fact label="기기" value={deviceSummary(summary)} />
          <Fact label="활동" value={activitySummary(summary.counts)} />
          <Fact label="동의" value={consentSummary(summary.consent)} />
        </dl>
      ) : summaryPending ? (
        <div
          className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-hidden="true"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="space-y-1.5">
              <div className="h-3 w-12 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        // Not an error tone: an account whose summary projection has not been
        // built yet still has a profile worth reading.
        <p className="text-sm text-muted-foreground">요약 정보 준비 중</p>
      )}
    </header>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words tabular-nums">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 15: Write the failing page test**

Create `src/features/users/UserDetailPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

vi.mock("@/auth/api/admin-users.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-users.api")>();
  return {
    ...actual,
    getAdminUser: vi.fn(),
    getAdminUserSummary: vi.fn(),
    getAdminUserTimeline: vi.fn(),
  };
});

vi.mock("@/auth/api/admin-resources.api", () => ({
  mutateAdminResource: vi.fn(),
}));

vi.mock("@/features/analytics/UserBehaviorPanel", () => ({
  UserBehaviorPanel: ({ userId, nickname }: { userId: string; nickname: string }) => (
    <div data-testid="behavior-panel">{`${nickname}:${userId}`}</div>
  ),
}));

import {
  getAdminUser,
  getAdminUserSummary,
  getAdminUserTimeline,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/auth/api/admin-users.api";
import { mutateAdminResource } from "@/auth/api/admin-resources.api";
import { UserDetailPage } from "./UserDetailPage";

const analytics = {
  properties: [{ id: "5678", label: "Dopa App", platform: "mixed" as const }],
  googleClientId: "public-client-id",
  configError: null,
};

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    profile: {
      id: "u1",
      nickname: "민정",
      email: "min@dopa.ing",
      profileImage: null,
      status: "ACTIVE",
      createdAt: "2026-01-02T00:00:00.000Z",
      lastSeenAt: "2026-09-07T10:00:00.000Z",
      deletedAt: null,
    },
    devices: {
      activeSessionCount: 2,
      sessions: [
        {
          id: "s1",
          subjectType: "USER",
          platform: "ios",
          deviceName: "iPhone",
          appVersion: "1.0.5",
          ip: null,
          userAgent: null,
          createdAt: null,
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
      ],
      pushTokens: [],
    },
    counts: {
      applications: { APPROVED: 3 },
      payments: { count: 4, paidCount: 3, paidAmount: 90000, businessCount: 2 },
      refunds: { count: 1, completedAmount: 20000 },
      reportsFiled: 1,
      reportsReceived: { total: 2, pending: 1 },
      activeRestrictions: [],
    },
    consent: {
      termsVersion: "v3",
      agreedAt: "2026-01-02T00:00:00.000Z",
      marketingOptIn: true,
    },
    asOf: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: "u1",
    email: "min@dopa.ing",
    nickname: "민정",
    profileImage: null,
    provider: "google",
    role: "USER",
    status: "ACTIVE",
    averageRating: 4.5,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    assignedBusinessId: null,
    blocked: false,
    asOf: "2026-09-08T00:00:00.000Z",
    summary: summary(),
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const rendered = render(
    <QueryClientProvider client={client}>
      <UserDetailPage userId="u1" analytics={analytics} />
    </QueryClientProvider>,
  );
  return { ...rendered, invalidate };
}

describe("UserDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getAdminUser).mockReset();
    vi.mocked(getAdminUserSummary).mockReset();
    vi.mocked(mutateAdminResource).mockReset();
    vi.mocked(getAdminUserTimeline).mockReset();
    vi.mocked(getAdminUserTimeline).mockResolvedValue({
      user: { id: "u1", nickname: "민정", status: "ACTIVE", deletedAt: null },
      items: [],
      nextCursor: null,
      asOf: "2026-09-08T00:00:00.000Z",
      coverage: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the profile, the facts and the way back to the list", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail());
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "민정", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 사용자 목록" })).toHaveAttribute(
      "href",
      "/super-admin/users",
    );
    expect(screen.getByText("u1")).toBeInTheDocument();
    expect(screen.getByText("min@dopa.ing")).toBeInTheDocument();
    expect(screen.getByText("google")).toBeInTheDocument();
    expect(screen.getByText(/결제 3\/4건/)).toBeInTheDocument();
    expect(screen.getByText(/마케팅 동의/)).toBeInTheDocument();
    // The inline summary means the separate route is never called.
    expect(getAdminUserSummary).not.toHaveBeenCalled();
  });

  it("hands the lazy GA panel this user's id", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail());
    renderPage();

    expect(await screen.findByTestId("behavior-panel")).toHaveTextContent("민정:u1");
  });

  it("renders a withdrawn account from the summary when the row is gone", async () => {
    vi.mocked(getAdminUser).mockRejectedValue(
      new AdminAuthError("NOT_FOUND", "gone", { status: 404 }),
    );
    vi.mocked(getAdminUserSummary).mockResolvedValue(
      summary({
        profile: {
          ...summary().profile,
          deletedAt: "2026-09-05T00:00:00.000Z",
          status: "SUSPENDED",
        },
      }),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "민정", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("탈퇴")).toBeInTheDocument();
    expect(screen.queryByText("사용자를 찾을 수 없습니다")).not.toBeInTheDocument();
  });

  it("says the account does not exist when neither route has a row", async () => {
    vi.mocked(getAdminUser).mockRejectedValue(
      new AdminAuthError("NOT_FOUND", "gone", { status: 404 }),
    );
    vi.mocked(getAdminUserSummary).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("사용자를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 사용자 목록" })).toBeInTheDocument();
  });

  it("names a permission failure instead of showing an empty profile", async () => {
    vi.mocked(getAdminUser).mockRejectedValue(
      new AdminAuthError("FORBIDDEN", "nope", { status: 403 }),
    );
    vi.mocked(getAdminUserSummary).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("이 계정을 볼 권한이 없습니다.")).toBeInTheDocument();
  });

  it("keeps the profile readable when the summary projection is missing", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail({ summary: null }));
    vi.mocked(getAdminUserSummary).mockResolvedValue(null);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "민정", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("요약 정보 준비 중")).toBeInTheDocument();
  });

  it("bans through the shared confirm dialog and refreshes both caches", async () => {
    vi.mocked(getAdminUser).mockResolvedValue(detail());
    vi.mocked(mutateAdminResource).mockResolvedValue({ id: "u1" });
    const user = userEvent.setup();
    const { invalidate } = renderPage();

    await screen.findByRole("heading", { name: "민정", level: 1 });
    await user.click(screen.getByRole("button", { name: "정지" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "정지" })).toBeInTheDocument();
    expect(within(dialog).getByText(/이름 민정/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "정지" }));

    await waitFor(() =>
      expect(mutateAdminResource).toHaveBeenCalledWith(
        "/admin/v2/users/u1/ban",
        "POST",
        undefined,
      ),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["admin", "users", "detail", "u1"],
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-v2", "users"] });
  });
});
```

- [ ] **Step 16: Run it and watch it fail**

Run: `npx vitest run src/features/users/UserDetailPage.test.tsx`
Expected: FAIL with "Failed to resolve import ./UserDetailPage".

- [ ] **Step 17: Write `UserDetailPage.tsx`**

Create `src/features/users/UserDetailPage.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  isAdminForbidden,
  isAdminNotFound,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/auth/api/admin-users.api";
import {
  mutateAdminResource,
  type AdminResource,
} from "@/auth/api/admin-resources.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { ROUTE_SUPER_ADMIN_USERS } from "@/auth/model/admin-routes";
import { usersConfig } from "@/components/admin/resource-configs/users";
import {
  ResourceActionDialog,
  type PendingResourceAction,
} from "@/components/admin/resource-console/ResourceActionDialog";
import { createRetryableLazyComponent } from "@/components/performance/RetryableLazyComponent";
import { Button } from "@/components/ui/button";
import type { AnalyticsPropertyConfig } from "@/features/analytics/types";
import type { UserBehaviorPanelProps } from "@/features/analytics/UserBehaviorPanel";
import { UserDetailHeader } from "./UserDetailHeader";
import { UserFlowTimeline } from "./UserFlowTimeline";
import { useUserDetailQuery, useUserSummaryQuery } from "./use-user-detail-query";

/**
 * 한 사용자, 한 화면.
 *
 * 서버 활동 타임라인과 GA 화면 흐름을 좌우로 나란히 둔다. "결제 실패 21:14"와
 * "21:13 /payment"를 같은 스크롤에서 볼 수 있어야 조사가 끝나기 때문에 탭으로
 * 나누지 않았다.
 *
 * GA 코드는 lazy 청크로만 들어온다. 이 파일이 analytics-data-api나
 * google-analytics-oauth를 정적으로 import하면 릴리스 계약 테스트가 막는다.
 */

function UserBehaviorSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

const LazyUserBehaviorPanel = createRetryableLazyComponent<UserBehaviorPanelProps>(
  () =>
    import("@/features/analytics/UserBehaviorPanel").then((module) => ({
      default: module.UserBehaviorPanel,
    })),
  {
    loading: <UserBehaviorSkeleton />,
    errorTitle: "행동 분석 모듈을 불러오지 못했습니다.",
  },
);

export type UserDetailPageProps = {
  userId: string;
  analytics: {
    properties: AnalyticsPropertyConfig[];
    googleClientId: string;
    configError: string | null;
  };
};

function detailFromSummary(
  userId: string,
  summary: AdminUserSummary,
): AdminUserDetail {
  return {
    id: summary.profile.id || userId,
    email: summary.profile.email,
    nickname: summary.profile.nickname,
    profileImage: summary.profile.profileImage,
    provider: null,
    role: "USER",
    status: summary.profile.status,
    averageRating: null,
    createdAt: summary.profile.createdAt,
    updatedAt: null,
    assignedBusinessId: null,
    blocked: false,
    asOf: summary.asOf || null,
    summary,
  };
}

export function UserDetailPage({ userId, analytics }: UserDetailPageProps) {
  const queryClient = useQueryClient();
  const detailQuery = useUserDetailQuery(userId);
  const detailMissing = isAdminNotFound(detailQuery.error);
  // The detail route may inline the summary. Only ask the dedicated route once
  // the detail has settled and did not carry one — or when the detail 404s,
  // which is how a withdrawn account looks. Enabling this on the first render
  // would fire a second request for every user whose detail inlines a summary.
  const summaryQuery = useUserSummaryQuery(userId, {
    enabled: (detailQuery.isSuccess && !detailQuery.data.summary) || detailMissing,
  });
  const [pending, setPending] = useState<PendingResourceAction | null>(null);

  const mutation = useMutation({
    mutationFn: (input: {
      path: string;
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: Record<string, unknown>;
    }) => mutateAdminResource(input.path, input.method, input.body),
    onSuccess: () => {
      toast.success("처리되었습니다.");
      setPending(null);
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.detail(userId),
      });
      // The list console caches under its own prefix; leaving it stale would
      // show "정상" next to an account this screen just suspended.
      void queryClient.invalidateQueries({ queryKey: ["admin-v2", "users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "처리하지 못했습니다."),
  });

  const summary = detailQuery.data?.summary ?? summaryQuery.data ?? null;
  const user =
    detailQuery.data ??
    (detailMissing && summary ? detailFromSummary(userId, summary) : null);

  if (!user && (detailQuery.isPending || (detailMissing && summaryQuery.isPending))) {
    return <UserDetailSkeleton />;
  }

  if (!user) {
    if (isAdminForbidden(detailQuery.error)) {
      return (
        <UserDetailNotice
          title="이 계정을 볼 권한이 없습니다."
          description="SUPER_ADMIN 권한이 있는 계정으로 다시 로그인해 주세요."
        />
      );
    }
    if (detailMissing) {
      return (
        <UserDetailNotice
          title="사용자를 찾을 수 없습니다"
          description="삭제되었거나 주소가 잘못되었습니다."
        />
      );
    }
    return (
      <UserDetailNotice
        title="사용자 정보를 불러오지 못했습니다."
        description={
          detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "잠시 후 다시 시도해 주세요."
        }
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const actionRow: AdminResource = {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };

  const actions = (usersConfig.actions ?? [])
    .filter((action) => !action.hidden?.(actionRow))
    .map((action) => (
      <Button
        key={action.label}
        size="sm"
        variant={action.destructive ? "destructive" : "outline"}
        disabled={mutation.isPending}
        onClick={() => {
          mutation.reset();
          setPending({ action, row: actionRow, reason: "", amount: "" });
        }}
      >
        {action.label}
      </Button>
    ));

  const submitAction = () => {
    if (!pending) return;
    const body = pending.action.body?.(pending.row, {});
    if (body === null) return;
    mutation.mutate({
      path: pending.action.path(pending.row),
      method: pending.action.method ?? "POST",
      ...(body === undefined ? {} : { body }),
    });
  };

  return (
    <div className="space-y-6">
      <UserDetailHeader
        user={user}
        summary={summary}
        summaryPending={summaryQuery.isPending && summaryQuery.fetchStatus !== "idle"}
        withdrawn={detailMissing || Boolean(summary?.profile.deletedAt)}
        actions={actions}
      />

      <nav aria-label="사용자 상세 섹션" className="flex gap-2 xl:hidden">
        <a
          href="#flow"
          className="rounded-lg border px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          활동 플로우
        </a>
        <a
          href="#behavior"
          className="rounded-lg border px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          앱 행동 흐름
        </a>
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section id="flow" aria-labelledby="user-flow-title" className="min-w-0 space-y-3">
          <h2 id="user-flow-title" className="text-lg font-semibold tracking-tight">
            활동 플로우
          </h2>
          <UserFlowTimeline userId={userId} />
        </section>
        <section
          id="behavior"
          aria-labelledby="user-behavior-title"
          className="min-w-0 space-y-3"
        >
          <h2 id="user-behavior-title" className="text-lg font-semibold tracking-tight">
            앱 행동 흐름
          </h2>
          <LazyUserBehaviorPanel
            userId={userId}
            nickname={user.nickname}
            properties={analytics.properties}
            googleClientId={analytics.googleClientId}
            configError={analytics.configError}
          />
        </section>
      </div>

      <ResourceActionDialog
        config={usersConfig}
        pending={pending}
        isPending={mutation.isPending}
        confirmDisabled={mutation.isPending}
        error={mutation.error instanceof Error ? mutation.error : null}
        onReasonChange={(reason) =>
          setPending((current) => (current ? { ...current, reason } : current))
        }
        onAmountChange={(amount) =>
          setPending((current) => (current ? { ...current, amount } : current))
        }
        onSubmit={submitAction}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

function UserDetailNotice({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <Link
        href={ROUTE_SUPER_ADMIN_USERS}
        prefetch={false}
        className="inline-block rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← 사용자 목록
      </Link>
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6"
      >
        <p className="font-medium text-destructive">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {onRetry ? (
          <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
            다시 시도
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UserDetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex gap-4 border-b pb-5">
        <div className="size-10 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    </div>
  );
}
```

- [ ] **Step 18: Run it and watch it pass**

Run: `npx vitest run src/features/users/UserDetailPage.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 19: Write the failing route test**

Create `src/app/(super-admin)/super-admin/users/[id]/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/oidc/public-clients", () => ({
  publicGoogleClientId: () => "existing-google-client-id",
}));

vi.mock("@/features/users/UserDetailPage", () => ({
  UserDetailPage: ({
    userId,
    analytics,
  }: {
    userId: string;
    analytics: {
      properties: Array<{ label: string }>;
      googleClientId: string;
      configError: string | null;
    };
  }) => (
    <section>
      <h1>{userId}</h1>
      <p>{analytics.properties[0]?.label ?? "No property"}</p>
      <p>{analytics.googleClientId}</p>
      {analytics.configError ? <p role="alert">{analytics.configError}</p> : null}
    </section>
  ),
}));

import SuperAdminUserDetailRoute from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("SuperAdminUserDetailRoute", () => {
  it("awaits the route param and passes validated public GA config down", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_GA4_PROPERTIES",
      JSON.stringify([{ id: "5678", label: "Dopa App", platform: "mixed" }]),
    );

    render(await SuperAdminUserDetailRoute({ params: Promise.resolve({ id: "u1" }) }));

    expect(screen.getByRole("heading", { name: "u1" })).toBeInTheDocument();
    expect(screen.getByText("Dopa App")).toBeInTheDocument();
    expect(screen.getByText("existing-google-client-id")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces invalid public configuration instead of rendering a broken panel", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA4_PROPERTIES", "invalid");

    render(await SuperAdminUserDetailRoute({ params: Promise.resolve({ id: "u1" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("올바른 JSON 배열");
  });
});
```

- [ ] **Step 20: Run it and watch it fail**

Run: `npx vitest run "src/app/(super-admin)/super-admin/users/[id]/page.test.tsx"`
Expected: FAIL — the route module does not exist.

- [ ] **Step 21: Write the route**

Create `src/app/(super-admin)/super-admin/users/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { publicGoogleClientId } from "@/auth/oidc/public-clients";
import { parseAnalyticsProperties } from "@/features/analytics/property-config";
import { UserDetailPage } from "@/features/users/UserDetailPage";

export const metadata: Metadata = {
  title: "사용자 상세",
};

/**
 * `/super-admin/users`는 그대로 `[section]/page.tsx`가 처리한다.
 * 여기에 `users/page.tsx`를 만들면 목록 라우트가 가려진다 — 만들지 말 것.
 *
 * `params` 타입은 `.next/types` 생성물에 의존하지 않도록 직접 적는다.
 */
export default async function SuperAdminUserDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const config = parseAnalyticsProperties(process.env.NEXT_PUBLIC_GA4_PROPERTIES);

  return (
    <UserDetailPage
      userId={id}
      analytics={{
        properties: config.ok ? config.properties : [],
        configError: config.ok ? null : config.message,
        googleClientId: publicGoogleClientId(),
      }}
    />
  );
}
```

- [ ] **Step 22: Run it and watch it pass**

Run: `npx vitest run "src/app/(super-admin)/super-admin/users/[id]/page.test.tsx"`
Expected: PASS

- [ ] **Step 23: Run the whole suite plus lint and the boundary check**

Run: `npx vitest run && npm run lint && npm run check:admin-runtime`
Expected: PASS

- [ ] **Step 24: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD
git add src/lib/format-date.ts src/lib/format-date.test.ts \
        src/features/users \
        "src/app/(super-admin)/super-admin/users"
git commit -m "$(cat <<'MSG'
feat(users): add /super-admin/users/[id] with the activity timeline

One screen per user: profile and counts on top, the server-side activity
timeline and the GA4 screen flow side by side below. They scroll together
rather than sitting in tabs, because the whole value is reading the payment
failure at 21:14 next to the payment screen at 21:13 at once.

Day grouping cuts at Seoul midnight, not UTC, so last night's events do not
land in today's column. A reference only becomes a link when a real URL exists
— guessing one would hand the investigator a 404 and cost the screen its
credibility. A 404 on the detail route with a live summary is read as a
withdrawn account and still renders.

The route adds only the [id] segment: /super-admin/users keeps resolving to
the generic section console.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 6: Navigation — reach the detail page from the list

**Files:**
- Modify: `src/components/admin/resource-configs/types.ts` (add one optional member to `ResourceConfig`)
- Modify: `src/components/admin/resource-configs/users.ts`
- Modify: `src/components/admin/resource-console/ResourceList.tsx` (desktop cell loop at :228-237, mobile primary paragraph at :264-269)
- Modify: `src/components/admin/resource-console/ResourceDetailSheet.tsx` (`SheetFooter` at :69-71)
- Test: `src/components/admin/AdminResourceConsole.test.tsx` (append two `it`s)
- Test: `src/components/admin/AdminResourceConsole.config.test.ts` (append one `it`)
- Test: `src/components/layout/AdminSidebar.test.ts` (append one `it`)

**Interfaces:**
- Consumes: `superAdminUserDetailPath(userId: string): string` (Task 1).
- Produces: `ResourceConfig.detailHref?: (row: AdminResource) => string` — optional, so the twelve other resource configs are untouched and keep behaving exactly as they do today.

Read first: `src/components/admin/BusinessAdminAssignmentConsole.tsx:262-272` — the `Button` + `Link` composition to copy:

```tsx
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={businessDetailPath(selectedBusiness.id)} />
                  }
                >
                  업체 상세 보기
                </Button>
```

**Verified deviation:** Base UI's `Button` keeps `role="button"` on the rendered anchor. The DOM is `<a href="…" role="button" tabindex="0">`, so in tests this element is found with `getByRole("button", { name: … })` — **not** `getByRole("link", …)` — and the href is asserted with `toHaveAttribute("href", …)`. A plain `<Link>` (the first-column one) does expose `role="link"`.

- [ ] **Step 1: Write the failing navigation tests**

Append to `src/components/admin/AdminResourceConsole.test.tsx`, inside `describe("AdminResourceConsole", …)`:

```tsx
  it("turns the users list's first column into a link to the detail page", async () => {
    navigation.pathname = "/super-admin/users";
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [{ id: "user-1", nickname: "민정", status: "ACTIVE" }],
      nextCursor: null,
      asOf: page.asOf,
    });
    renderConsole(resourceConfigs.users);

    const link = await screen.findByRole("link", { name: "민정" });
    expect(link).toHaveAttribute("href", "/super-admin/users/user-1");
    // The sheet is still the quick look; the link is the full screen.
    expect(screen.getAllByRole("button", { name: "상세" }).length).toBeGreaterThan(0);
  });

  it("offers the detail page from the sheet only for resources that have one", async () => {
    navigation.pathname = "/super-admin/users";
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [{ id: "user-1", nickname: "민정", status: "ACTIVE" }],
      nextCursor: null,
      asOf: page.asOf,
    });
    const user = userEvent.setup();
    renderConsole(resourceConfigs.users);

    await user.click((await screen.findAllByRole("button", { name: "상세" }))[0]);

    // Base UI keeps role="button" on the rendered anchor.
    const open = await screen.findByRole("button", { name: "상세 페이지 열기" });
    expect(open).toHaveAttribute("href", "/super-admin/users/user-1");

    cleanup();
    navigation.pathname = "/super-admin/payments";
    vi.mocked(listAdminResources).mockResolvedValue({ ...page, nextCursor: null });
    renderConsole(resourceConfigs.payments);
    await user.click((await screen.findAllByRole("button", { name: "상세" }))[0]);

    expect(
      screen.queryByRole("button", { name: "상세 페이지 열기" }),
    ).not.toBeInTheDocument();
  });
```

Append to `src/components/admin/AdminResourceConsole.config.test.ts`:

```ts
  it("gives only the users console a detail page", () => {
    expect(resourceConfigs.users.detailHref?.({ id: "user 1" })).toBe(
      "/super-admin/users/user%201",
    );
    for (const [key, config] of Object.entries(resourceConfigs)) {
      if (key === "users") continue;
      expect(config.detailHref).toBeUndefined();
    }
  });
```

Append to `src/components/layout/AdminSidebar.test.ts`:

```ts
  it("keeps the user detail route under the 사용자 menu", () => {
    expect(adminRouteLabel("/super-admin/users")).toBe("사용자");
    expect(adminRouteLabel("/super-admin/users/user-1")).toBe("사용자");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/admin/AdminResourceConsole.test.tsx src/components/admin/AdminResourceConsole.config.test.ts src/components/layout/AdminSidebar.test.ts`
Expected: the two console tests and the config test FAIL (no link, no sheet button, `detailHref` undefined). The sidebar test should already PASS — `isActiveRoute`/`adminRouteLabel` prefix-match, so the nested route needs no change. If it fails, stop and fix the sidebar before continuing.

- [ ] **Step 3: Add `detailHref` to the config contract**

In `src/components/admin/resource-configs/types.ts`, add to `ResourceConfig` after `statusOptions`:

```ts
  /**
   * Full-screen destination for one row.
   *
   * Optional: a resource without a detail page keeps the sheet as its only
   * detail view, and nothing about those consoles changes.
   */
  detailHref?: (row: AdminResource) => string;
```

In `src/components/admin/resource-configs/users.ts`, import the path helper and add the member after `resource: "users",`:

```ts
import { superAdminUserDetailPath } from "@/auth/model/admin-routes";
```

```ts
  detailHref: (row) => superAdminUserDetailPath(String(row.id)),
```

- [ ] **Step 4: Link the first column in `ResourceList.tsx`**

Add the import at the top:

```tsx
import Link from "next/link";
```

Add this helper next to `ResourceEmpty`:

```tsx
/**
 * The first column is the row's identity, so it is the row's link.
 *
 * Linking the whole row would swallow the action buttons inside it; linking a
 * separate icon would add a target too small to hit on the operator's laptop
 * trackpad.
 */
function primaryCellContent(
  config: ResourceConfig,
  row: AdminResource,
  columnKey: string,
) {
  const value = renderResourceValue(row[columnKey], columnKey);
  const href =
    columnKey === config.columns[0]?.key ? config.detailHref?.(row) : undefined;
  if (!href) return value;
  return (
    <Link
      href={href}
      prefetch={false}
      className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {value}
    </Link>
  );
}
```

In the desktop cell loop (currently line 233), replace

```tsx
                        {renderResourceValue(row[column.key], column.key)}
```

with

```tsx
                        {primaryCellContent(config, row, column.key)}
```

In the mobile card's primary paragraph (currently line 267), replace

```tsx
                    {renderResourceValue(row[primaryKey], primaryKey)}
```

with

```tsx
                    {primaryCellContent(config, row, primaryKey)}
```

- [ ] **Step 5: Add the sheet footer button**

In `src/components/admin/resource-console/ResourceDetailSheet.tsx`, add the imports:

```tsx
import Link from "next/link";
import { ExternalLink } from "lucide-react";
```

and replace the footer:

```tsx
        <SheetFooter className="border-t bg-muted/30 px-5 py-3">
          {row && config.detailHref ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={config.detailHref(row)} prefetch={false} />}
            >
              <ExternalLink /> 상세 페이지 열기
            </Button>
          ) : null}
          <SheetClose render={<Button variant="outline" />}>닫기</SheetClose>
        </SheetFooter>
```

- [ ] **Step 6: Run them and watch them pass**

Run: `npx vitest run src/components/admin src/components/layout`
Expected: PASS — including every pre-existing `AdminResourceConsole.test.tsx` assertion.

- [ ] **Step 7: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD
git add src/components/admin/resource-configs/types.ts \
        src/components/admin/resource-configs/users.ts \
        src/components/admin/resource-console/ResourceList.tsx \
        src/components/admin/resource-console/ResourceDetailSheet.tsx \
        src/components/admin/AdminResourceConsole.test.tsx \
        src/components/admin/AdminResourceConsole.config.test.ts \
        src/components/layout/AdminSidebar.test.ts
git commit -m "$(cat <<'MSG'
feat(admin): reach the user detail page from the list and the detail sheet

The generic console can now declare a full-screen destination per row. The
users console is the only one that has one, so every other console is byte-for-
byte unchanged in behaviour.

The name in the first column is the link, and the sheet keeps its place as the
quick look with an explicit way out to the full screen. Linking the whole row
would have swallowed the action buttons inside it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

### Task 7: Docs, environment note, release contract, full verify

**Files:**
- Modify: `docs/OPERATIONS.md` (route table at :71-81; GA4 section at :87-117)
- Modify: `.env.example:7-9` (comment only)
- Modify: `scripts/test-admin-ui-foundation.mjs` (add one `test(...)`)

**Interfaces:**
- Consumes: the files created in Tasks 3-5 — `src/features/users/UserDetailPage.tsx`, `src/features/analytics/analytics-token-store.ts`, `docs/OPERATIONS.md`.
- Produces: nothing importable. This task turns three decisions into contracts a future change cannot quietly undo: the GA chunk stays lazy, the runbook documents `dopa_uid`, and the token stays session-bound.

Read first: `scripts/test-admin-ui-foundation.mjs:307-317` — the existing GA4 documentation test whose assertions must keep passing (it requires `/super-admin/analytics`, `analytics.readonly` and the exact phrase `브라우저 메모리` in `docs/OPERATIONS.md`), and `:216-248` for the shape of a lazy-chunk assertion.

- [ ] **Step 1: Write the failing release-contract test**

Append to `scripts/test-admin-ui-foundation.mjs`:

```js
test("user detail keeps GA reporting lazy and documents the dopa_uid dimension", async () => {
  const [page, operations, tokenStore] = await Promise.all([
    readFile(
      new URL("src/features/users/UserDetailPage.tsx", root),
      "utf8",
    ),
    readFile(new URL("docs/OPERATIONS.md", root), "utf8"),
    readFile(
      new URL("src/features/analytics/analytics-token-store.ts", root),
      "utf8",
    ),
  ]);

  assert.match(
    page,
    /createRetryableLazyComponent<[\s\S]*import\("@\/features\/analytics\/UserBehaviorPanel"\)/,
  );
  assert.doesNotMatch(page, /analytics-data-api/);
  assert.doesNotMatch(page, /google-analytics-oauth/);
  assert.doesNotMatch(page, /from\s+["']@\/features\/analytics\/AnalyticsDashboard["']/);

  assert.match(operations, /\/super-admin\/users\/:id/);
  assert.match(operations, /dopa_uid/);
  assert.match(operations, /customUser:dopa_uid/);

  // The Google grant outlives a route change now; it must not outlive the
  // admin session that authorized it.
  assert.match(tokenStore, /getAdminSessionGeneration/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test scripts/test-admin-ui-foundation.mjs`
Expected: FAIL on the `docs/OPERATIONS.md` assertions (the code assertions already pass after Tasks 3 and 5).

- [ ] **Step 3: Document the route**

In `docs/OPERATIONS.md`, add one row to the route table, right after the 전역 관리 콘솔 row:

```markdown
| 사용자 상세·플로우·행동(GA4)    | `SUPER_ADMIN`    | `/super-admin/users/:id`               |
```

- [ ] **Step 4: Correct the token-lifecycle sentence**

In the GA4 section, replace the bullet that currently reads

```markdown
- OAuth access token은 브라우저 메모리에만 유지하고 화면 이탈·연결 해제·만료 시 제거한다.
  localStorage, sessionStorage, cookie, URL, 로그, Sentry에는 기록하지 않는다.
```

with

```markdown
- OAuth access token은 브라우저 메모리에만 유지하고 로그아웃·관리자 세션 교체·연결 해제·만료
  시 제거한다. 탭을 닫거나 새로고침하면 사라진다. 화면을 이동한다고 버리지는 않는다 —
  분석 화면과 사용자 상세 화면을 오갈 때마다 Google 동의 창이 다시 뜨면 조사가 끊긴다.
  localStorage, sessionStorage, cookie, URL, 로그, Sentry에는 기록하지 않는다.
```

The phrase `브라우저 메모리` must survive this edit; the release test asserts it.

- [ ] **Step 5: Add the user-flow subsection**

Append this subsection to `docs/OPERATIONS.md` immediately after the GA4 section's last bullet and before `## 관리자 API 규약`:

```markdown
### 사용자 상세 행동 흐름

`/super-admin/users/:id`의 "앱 행동 흐름"은 같은 GA4 연결을 사용해 **한 사용자**의 화면
이동을 조회한다. 서버 활동 타임라인과 나란히 놓여 있어서, 서버가 기록한 사건과 그때
사용자 화면에서 벌어진 일을 한 화면에서 대조할 수 있다.

사전 설정(한 번만):

1. GA4 관리 → 맞춤 정의 → 맞춤 측정기준 만들기
2. 범위: **사용자**, 사용자 속성: `dopa_uid`, 측정기준 이름은 자유
3. 앱은 로그인 시 `dopa_uid` 사용자 속성을 전송한다(앱 릴리스 필요)

주의할 점:

- 맞춤 측정기준은 **소급 적용되지 않는다**. 등록 이후 수집된 이벤트만 조회된다. 등록 전
  기간을 조회하면 빈 결과가 나오며, 이것은 사용자가 앱을 쓰지 않았다는 뜻이 아니다.
- 측정기준이 없는 속성에 요청하면 GA4는 400을 반환한다. 화면은 이를 "GA4에 사용자 식별
  측정기준이 아직 없어요"로 구분해 표시하고 재시도 버튼 대신 위 설정 절차를 안내한다.
- 조회 조건은 `customUser:dopa_uid`에 대한 **EXACT** 문자열 필터다. 부분 일치나 정규식은
  쓰지 않는다.
- 시간 단위는 `dateHourMinute`(분)이며, GA4 속성의 시간대 기준 벽시계 그대로 표시한다.
  브라우저 시간대로 변환하지 않는다.
- 세션 경계는 **30분** 무활동이다. 정확히 30분 공백은 같은 세션, 31분부터 새 세션이다.
  GA4 자체 세션 정의와 같은 기준이지만, 이 화면이 분 단위 행에서 직접 계산한 값이다.
- GA4 처리 지연으로 최근 **24~48시간**은 일부 또는 전부 누락될 수 있다.
- 개인정보 보호 임계값(thresholding)은 한 사람만 조회할 때 특히 잘 걸린다. Google 신호
  데이터가 켜져 있거나 보고 ID가 기기 기반이 아닐 때 소규모 행이 제외될 수 있으며, 이
  경우 화면에 데이터 품질 안내가 함께 표시된다. 빈 결과를 "행동이 없었다"로 단정하지 않는다.
- 한 번 조회에서 읽는 행은 10,000행 × 최대 3페이지다. 상한을 넘으면 화면이 잘렸다고
  명시하고 기간을 좁힐 것을 안내한다.
```

- [ ] **Step 6: Add the `.env.example` comment**

In `.env.example`, extend the comment above `NEXT_PUBLIC_GA4_PROPERTIES` (do **not** add a variable — the dimension is a constant in code, not configuration):

```dotenv
# Public descriptors only. Replace IDs with the numeric GA4 Property IDs that
# the signed-in operator can view; never place OAuth tokens or service keys here.
# 사용자 상세(/super-admin/users/:id)의 행동 흐름은 이 속성들에 사용자 범위 맞춤
# 측정기준 `dopa_uid`가 등록되어 있어야 조회된다. 측정기준 이름은 코드 상수이며
# 환경 변수가 아니다. 설정 절차는 docs/OPERATIONS.md의 "사용자 상세 행동 흐름" 참고.
NEXT_PUBLIC_GA4_PROPERTIES='[{"id":"123456789","label":"Dopa Web","platform":"web"},{"id":"987654321","label":"Dopa App","platform":"mixed"}]'
```

- [ ] **Step 7: Run the release-contract tests**

Run: `npm run test:release`
Expected: PASS, including the pre-existing "GA4 reporting setup is documented as public build configuration" test that requires `브라우저 메모리`.

- [ ] **Step 8: Run the full verification**

Run: `npm run verify`
Expected: PASS end to end — `vitest run`, `node --test scripts/test-*.mjs`, `check:admin-runtime`, `eslint`, and the OpenNext build.

If the OpenNext build is the only failure and it is an environment problem (missing Cloudflare credentials, a sandbox network block), report that rather than changing code to route around it.

- [ ] **Step 9: Manually confirm the route table**

Run: `grep -n "super-admin/users" docs/OPERATIONS.md`
Expected: both the list route (via `/super-admin/:section`) and the new `/super-admin/users/:id` row are present.

- [ ] **Step 10: Commit**

```bash
cd /Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin-user-detail
git rev-parse --abbrev-ref HEAD
git add docs/OPERATIONS.md .env.example scripts/test-admin-ui-foundation.mjs
git commit -m "$(cat <<'MSG'
docs(ops): document the dopa_uid dimension and pin the user detail contracts

OPERATIONS.md gains the /super-admin/users/:id route and a subsection covering
the one-time GA4 setup: the custom dimension is not retroactive, so an empty
result before it existed does not mean the user was idle. The token-lifecycle
sentence now says logout and admin-session change rather than "leaving the
screen", which stopped being true.

The release test pins three things a later refactor could undo silently: the GA
chunk stays lazy on the users route, the runbook keeps documenting dopa_uid,
and the token store keeps checking the admin session generation.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
MSG
)"
```

---

## Self-Review

Run by the plan author against the spec, with fixes already applied inline above.

### 1. Spec coverage

| Spec section | Where it lands |
| --- | --- |
| Hard constraints (runtime boundaries, CSP, no `users/page.tsx`, guards, release tests) | Global Constraints; Task 5 Step 21 comment; Task 7 |
| Architecture file list | File Structure — every file in the spec's tree appears, plus `use-user-behavior-query.ts` and the two test files the spec's Tests section implies |
| Routing / page module | Task 5 Steps 19-22 |
| Data layer (`AdminApi`, `adminQueryKeys`, `admin-users.api.ts`, hooks, error handling) | Task 1 (data), Task 5 Step 9 (hooks), Task 5 Step 17 (error handling) |
| Page composition (layout, lazy chunk, quick actions) | Task 5 Step 17 |
| `UserDetailHeader` | Task 5 Step 14 |
| `UserFlowTimeline` | Task 5 Step 12 |
| `user-timeline-model.ts` | Task 5 Step 7 |
| GA per-user module (`analytics-data-api`, `user-behavior-report`, query hook, panel) | Tasks 2 and 4 |
| Shared extraction + token lifecycle | Task 3 |
| Navigation (`detailHref`, list, sheet, docs, env, release test) | Tasks 6 and 7 |
| Tests list (13 files) | All present: `admin-users.api.test.ts`, `admin-routes.test.ts`, `admin-query-keys.test.ts`, `user-timeline-model.test.ts`, `UserDetailPage.test.tsx`, `UserFlowTimeline.test.tsx`, `user-behavior-report.test.ts`, `analytics-data-api.test.ts`, `UserBehaviorPanel.test.tsx`, `analytics-token-store.test.ts`, `AnalyticsDashboard.test.tsx`, `page.test.tsx`, `AdminResourceConsole.test.tsx`, `AdminResourceConsole.config.test.ts`, `AdminSidebar.test.ts` |
| Sequencing | Tasks 1-7 follow it unchanged |

Deliberate gaps, each argued rather than forgotten:

- **`analytics-labels.ts` has no dedicated test.** `EVENT_LABELS` is a lookup with a raw-name fallback; `UserBehaviorPanel.test.tsx` asserts two of its entries render ("화면 조회 × 1", "데이터 변경 × 2"). A test asserting a map equals itself would only make renaming an event harder.
- **`AnalyticsStates.tsx` has no dedicated test.** It is a verbatim move; `AnalyticsDashboard.test.tsx` already covers `DataQualityPanel`, `AnalyticsErrorState` and the sampling percentage, and `UserBehaviorPanel.test.tsx` covers the new `unknown-field` presentation. A new test file here would pin the extraction, not the behaviour.
- **`use-analytics-connection.ts` has no dedicated test.** Its behaviour is asserted through both consumers, including the late-grant discard in `AnalyticsDashboard.test.tsx` and the connect flow in `UserBehaviorPanel.test.tsx`.
- **`UserDetailHeader.tsx` has no dedicated test.** Every branch (facts, skeleton, "요약 정보 준비 중", the blocked and withdrawn badges, the back link) is asserted through `UserDetailPage.test.tsx`, which is where those branches are actually reachable.

### 2. Placeholder scan

No "TBD", "similar to Task N", "add error handling", or bare prose where code was required. Every code step carries a complete block. Two places where a reader might expect a placeholder and does not get one:

- Task 5 Step 12's `TimelineRow` prop type is stated as `item: UserTimelineItem` with the import spelled out, not left implicit.
- Task 7 Step 4 quotes the exact sentence being replaced and the exact replacement, so the `브라우저 메모리` assertion cannot be broken by paraphrase.

### 3. Type consistency across tasks

- `UserTimelineItem.detail`, `.status`, `.amount`, `.refs`, `.meta` are **non-optional** in Task 1 (`string | null`, `number | null`, `UserTimelineRefs`, `Record<string, unknown>`), because the normalizer always fills them. The spec's type sketch marked some optional; the plan uses the stricter shape and every consumer in Tasks 5 and 6 matches it — `item.detail ? … : null`, `timelineRefsOf(item.refs)`.
- `UserTimelinePage.asOf` is `string | null` (Task 1), and `coverageSummaryText` takes `asOf: string | null` (Task 5). The spec wrote `asOf` bare; the nullable form is what the normalizer produces.
- `UserTimelineCoverageEntry.retainedFrom` is `string | null` (not optional) in Task 1; the Task 5 test fixtures pass `retainedFrom: null` accordingly.
- `fetchUserBehaviorFlow` (Task 2) is referenced by `useUserBehaviorQuery` (Task 4) with `{ property, userId, range, accessToken, signal }` — matching, with `fetchImpl` optional and used only by Task 2's own test.
- `shapeUserBehaviorRows(rows, meta)`'s `meta` is `UserBehaviorFlowMeta` (Task 2) and the Task 4 test builds it with exactly those five fields.
- `analyticsQueryKeys.userBehavior(generation, propertyId, userId, range)` — declared in Task 3, called in Task 4 with that argument order.
- `useAnalyticsConnection({ googleClientId, enabled })` — declared in Task 3, called with those two props by both `AnalyticsDashboard` (Task 3) and `UserBehaviorPanel` (Task 4).
- `UserBehaviorPanelProps` (Task 4) lists `userId`, `nickname`, `properties`, `googleClientId`, `configError`; `UserDetailPage` (Task 5) passes exactly those five, and the release test in Task 7 pins the lazy import that consumes them.
- `ResourceConfig.detailHref` is `(row: AdminResource) => string` in Task 6, and `usersConfig` supplies `(row) => superAdminUserDetailPath(String(row.id))` — `row.id` is typed `string` on `AdminResource`, and `String(...)` matches the existing `statusAction` helper's defensive style rather than diverging from it.
- `timelineFromIso(period, now)` returns `string | null`; `useUserTimelineQuery`'s `filters.from` is `string | null`; `coverageSummaryText`'s `from` is `string | null`. Consistent.
- `useCursorAppendFocus<HTMLLIElement>` in Task 5 matches `setItemRef: (key: string, node: HTMLLIElement | null) => void` as passed to `TimelineRow`.

### 4. Fixes applied during this review

- `UserFlowTimeline.test.tsx` asserted `getAdminUserTimeline` was called with only a cursor / only kinds. The component's default period is 28일, so `from` always rides along. Both expectations now include `from: expect.any(String)`.
- `UserBehaviorPanel.test.tsx` used `getByText("화면 조회 × 1")` on a fixture where two screen visits each carry one `screen_view`. Changed to `getAllByText(...)` with a length assertion.
- `UserDetailPage.tsx` enabled the summary query with `!detailQuery.data?.summary`, which is `true` on the first render and fired a second request for every user whose detail inlines a summary — and would have broken the `expect(getAdminUserSummary).not.toHaveBeenCalled()` assertion in its own test. It now waits for the detail query to settle: `(detailQuery.isSuccess && !detailQuery.data.summary) || detailMissing`, with `detailMissing` hoisted above the hook.

### 5. Known risks the executor should watch

- **`TIMELINE_CATEGORIES[].kinds` is unverified against the backend.** The backend PR `feat/admin-user-timeline` was not readable from this worktree. Reconcile the strings before merge. `filterTimelineItems` matching on `category` keeps the UI correct meanwhile, and `user-timeline-model.test.ts` has a test that pins that guarantee.
- **`AdminUserSummary.profile` field names** are inferred from the spec's prose plus the header's needs (`lastSeenAt`, `deletedAt`). If the backend names them differently, change only `normalizeUserSummary` in Task 1 — every consumer reads the normalized shape.
- **`AdminUserSession.appVersion`** is not in the spec's session field list but is required by the spec's own header requirement ("기기 (≤ 3: platform · appVersion)"). It is added to the type and defaults to `null`.
- **`UserTimelineRefs.userId`** is added; the spec listed only `targetId`. `timelineRefHref` needs a source for its `user` case, and `targetId` alone does not say what it points at, so `targetId` renders as an inert label.
- **Base UI `Button` with `render={<Link/>}`** exposes `role="button"`, not `link`. Task 6's test asserts accordingly.
- **`URLSearchParams` percent-encodes `,` and `:`.** Task 1's test asserts the encoded string.
