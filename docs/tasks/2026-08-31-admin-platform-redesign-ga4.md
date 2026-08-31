# TASK: Admin platform redesign and GA4 analytics

Status: implemented and locally verified on 2026-09-01; not deployed
Branch: `codex/admin-platform-redesign-ga4`

## Objective

Redesign the complete `spot-admin` frontend as a dense, neutral, accessible
operations platform while preserving every existing backend, authentication,
role, route, and browser-to-Cloudflare API contract. Add a SUPER_ADMIN-only
Google Analytics dashboard that reads multiple GA4 properties without adding
or changing a Dopa backend endpoint.

## Required implementation

1. Establish semantic design tokens, responsive shells, reusable page/table/
   state patterns, complete light and dark themes, metadata, favicon and app
   icon assets. SUPER_ADMIN is desktop-first and dense; BUSINESS_ADMIN remains
   mobile-first but must adapt cleanly to tablet and desktop widths.
2. Keep App Router route modules thin. Restrict client boundaries to auth,
   browser data fetching, state and event handlers. Lazy-load Tiptap, QR and
   Analytics-only code. Preserve existing direct Admin API access and query
   contracts.
3. Improve the dashboard, generic resource consoles, mail, reports, business,
   party and authentication surfaces using existing APIs only. Do not present
   notification-center, audit-log, bulk-job or export functionality as working
   without a backend contract.
4. Add `/super-admin/analytics`. Parse multiple public GA4 property descriptors,
   authorize with Google Identity Services using only
   `analytics.readonly`, keep access tokens in memory, and call the GA Data API
   directly. Provide overview, acquisition, engagement, conversion/revenue and
   realtime views with explicit empty, permission, expiry, quota and error
   states. Never persist or report Google access tokens.
5. Fix the lint scan so ignored nested worktrees and generated output cannot
   exhaust the Node heap. Add focused component/API tests and maintain all
   existing release/runtime checks.

## Non-goals and prohibitions

- No changes anywhere in `spot-cloudflare-backend` or other repositories.
- No backend API, schema, migration, Cloudflare resource, secret or production
  configuration changes.
- No direct work on `main`, push, PR, merge or deployment.
- No weakening, deleting or skipping tests and no `any` used to hide types.
- Do not persist OAuth access tokens in localStorage, sessionStorage, cookies,
  URLs, logs, analytics, or Sentry.

## Acceptance gates

- Existing and new Vitest tests pass.
- `npm run test:release`, `npm run check:admin-runtime`, `npm run lint`,
  `npm run build`, `npm run cf:build`, and `git diff --check` pass.
- Protected routes and role behavior remain compatible with the current Admin
  API and the existing session model.
- Core screens are keyboard-usable and responsive at 360, 430, 768, 1024 and
  1440 CSS pixels.
- Mail editor, QR scanner and GA reporting modules do not enter unrelated
  initial route bundles.

## Local verification snapshot (2026-09-01)

- `npm run verify`: 76 Vitest files / 339 tests, 55 release-contract tests,
  runtime boundary, ESLint and OpenNext Cloudflare build passed.
- `npx tsc --noEmit`, production dependency audit, bundle analysis and
  `git diff --check` passed; the production dependency audit reported zero
  vulnerabilities.
- Cursor-backed business, party, review, assignment, candidate and generic
  resource surfaces render only the current bounded page; chat retains a
  bidirectional 200-message window. Keyboard focus is handed to new content,
  retry actions or terminal empty states without losing cached back navigation.
- Light and dark primary/destructive hover pairs and opaque focus indicators
  are enforced by an OKLCH contrast regression test. Production OpenNext assets
  contain no bundled Pretendard font binary; Tiptap and GA reporting remain in
  independent lazy chunks.
- Authenticated desktop and mobile browser QA covered both admin roles. The
  sampled Lighthouse runs scored 100 for Accessibility, Best Practices, SEO
  and Agentic checks; the production login trace measured LCP 288 ms and CLS
  0.01 under the selected local throttling profile.
- The repository has no approved real `NEXT_PUBLIC_GA4_PROPERTIES` value in
  this worktree. Production build and deployment intentionally fail closed
  until a valid public property list is supplied, so live GA data and an
  actually promoted Worker remain external verification gates.
