# Legacy BFF Inventory (spot-admin Next.js `/api/*`)

**Policy:** No silent zombies. Every BFF is tagged, owned, and has a Nest replacement + deletion lifecycle.

**Auth bridge:** `requireRole` / `requireAnyRole` → Nest `GET /auth/v2/admin/me` (Bearer). NextAuth is gone.

**UI (post PR3):** `/super-admin/*` and `/business/*` **redirect** to `/app/*`. Auth v2 UI talks to **Nest** only. Residual BFF traffic must trend to **0**.

**Owner:** Admin Platform  

---

## Lifecycle (per feature group)

| State | Meaning |
|-------|---------|
| **ACTIVE** | Still has intentional UI/API callers |
| **RESIDUAL** | UI gone; possible dead components / old clients |
| **ZERO_TRAFFIC** | staging=0 and prod=0 for ≥14d (metrics) |
| **READY_TO_DELETE** | ZERO_TRAFFIC + code callers 0 + Nest E2E green + docs |
| **REMOVED** | Code deleted |

Update this column when evidence lands (`GET /api/metrics/legacy-bff`).

---

## Deletion gate (numeric — 2026-08 batch and later)

A group may be deleted **only if all** hold:

1. **Staging** `legacy_bff_requests_total` for those routes = **0** (after full E2E suite)  
2. **Production** same routes = **0** for **≥ 14 consecutive days**  
3. **Code search** for `/api/super-admin/businesses` (etc.) callers = **0** (excl. inventory/docs)  
4. **UI redirect** complete (`proxy` + layouts)  
5. **Nest substitute E2E** passed  
6. **Ops doc** lists Nest path as SoT  
7. **Rollback**: previous Admin image redeployable if needed  

Prefer metrics over “mostly none” intuition.

---

## Metrics (production-safe)

```
legacy_bff_requests_total{
  route,          # normalized, no dynamic ids
  method,
  status,         # ok | unauthorized | forbidden | hit | error
  role,           # SUPER_ADMIN | BUSINESS | anonymous | unknown
  environment,
  caller          # bff | scrape
}
```

| Allowed labels | Forbidden |
|----------------|-----------|
| route key, method, status, role, env, caller | access token, cookie, raw query, body, email, user id |

- **Scrape:** `GET /api/metrics/legacy-bff` (Prometheus text)  
- **JSON:** `?format=json`  
- **Optional auth:** `LEGACY_BFF_METRICS_TOKEN` as Bearer or `?token=`  
- **non-prod:** also `console.warn` once per route key  

Implementation: `src/lib/legacy-bff-metrics.ts` · recorded from `requireRole` / `requireAnyRole`.

---

## First deletion batch (2026-08) — target READY_TO_DELETE

Already: Nest API + Auth v2 UI + UI redirect + scope tests.

| Group | Paths | Lifecycle now | Nest SoT | Notes |
|-------|-------|---------------|----------|-------|
| **Businesses** | `super-admin/businesses*` | **RESIDUAL** | `/admin/v2/businesses` | include invite/admins/approve BFF |
| **SA Parties** | `super-admin/parties*` | **RESIDUAL** | `/admin/v2/businesses/:id/parties`, `/admin/v2/parties/:id` | |
| **Biz Parties** | `business/parties*` | **RESIDUAL** | same Nest party APIs | residual component refs only |
| **Invites** (BFF) | `super-admin/businesses/*/invite` | **RESIDUAL** | `/admin/v2/businesses/:id/invitations` | UI uses Nest; confirm metrics 0 then same batch |

When metrics show ZERO_TRAFFIC 14d → mark **READY_TO_DELETE** → open delete PR.

---

## Full inventory

### Platform

| BFF | UI | Nest | Lifecycle | Removal |
|-----|-----|------|-----------|---------|
| `observability/error` | **active** | n/a | ACTIVE | keep |
| `party-categories` | residual | partial | RESIDUAL | 2026-10 |
| `metrics/legacy-bff` | scrape | n/a | ACTIVE (ops) | keep until BFF gone |

### SUPER_ADMIN `super-admin/*`

| Group | UI | Nest | Lifecycle | Removal |
|-------|-----|------|-----------|---------|
| businesses* | none | **done** | **RESIDUAL** | **2026-08** |
| parties* | none | **done** | **RESIDUAL** | **2026-08** |
| users* | none | missing | RESIDUAL | 2026-10 |
| banners* | none | missing | RESIDUAL | 2026-10 |
| coupons* | none | missing | RESIDUAL | 2026-10 |
| notifications | none | partial | RESIDUAL | 2026-10 |
| inquiries* | none | partial | RESIDUAL | 2026-10 |
| config | none | partial | RESIDUAL | 2026-10 |
| payments/refunds | none | partial | RESIDUAL | 2026-09 |
| party-categories | none | missing | RESIDUAL | 2026-10 |
| review-tags* | none | missing | RESIDUAL | 2026-10 |
| business-role-requests* | none | partial | RESIDUAL | 2026-09 |

### BUSINESS `business/*`

| Group | UI | Nest | Lifecycle | Removal |
|-------|-----|------|-----------|---------|
| parties* | residual | **done** | **RESIDUAL** | **2026-08** |
| profile | none | partial | RESIDUAL | 2026-09 |
| forms* | none | partial | RESIDUAL | 2026-10 |
| applications* | none | partial | RESIDUAL | 2026-09 |
| chat* | none | partial | RESIDUAL | 2026-10 |
| payments/refunds | residual | partial | RESIDUAL | 2026-09 |

---

## Code deprecation

Every BFF `route.ts` carries:

```ts
/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */
```

---

## Ops sequence (evidence > commits)

1. Staging deploy (Nest + Admin + Worker)  
2. Cookie/CORS proof  
3. SUPER_ADMIN E2E  
4. BUSINESS_ADMIN isolation E2E  
5. Consumer Google/Apple E2E  
6. Outbox recovery  
7. **Watch `legacy_bff_requests_total` → 0**  
8. Production approval + cutover  
9. After 14d zero traffic → delete 2026-08 BFF group  

**Success criterion:** staging E2E pass + legacy BFF production traffic **0**, not commit count.
