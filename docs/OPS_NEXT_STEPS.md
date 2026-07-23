# Ops next steps — evidence-driven cutover

Code migration for Auth v2 admin is **done**. Success = **staging E2E + legacy BFF traffic 0**, not more auth features.

Production still needs **explicit approval**.

## Recommended order

1. **Perform** `docs/STAGING_E2E_CHECKLIST.md` + capture evidence A1–A8  
2. Fill checklist result summary  
3. Write 1-page release notes from `docs/RELEASE_NOTES_TEMPLATE.md`  
4. Production approval  
5. After prod 14d zero traffic → Legacy BFF delete PR (2026-08 group)

---

## 1. Backend (staging)

```
Migration Job → Nest API → Worker
```

Verify:

- [ ] `/health/live`
- [ ] `/health/ready`
- [ ] DB reachable
- [ ] Redis reachable
- [ ] Outbox polling (worker logs / SENT rows)

---

## 2. Admin Web

- [ ] `NEXT_PUBLIC_API_URL` → Nest staging  
- [ ] CORS: **exact** Admin origin + `credentials: true` (not `*`)  
- [ ] Cookies: only `spot_admin_rt|sid|aid` on Nest host  
- [ ] Login body: accessToken only (no refreshToken when useCookie)  
- [ ] `localStorage` / `sessionStorage` token keys = **0**  
- [ ] NextAuth cookies = **0**  

---

## 3. Admin E2E

### SUPER_ADMIN

- [ ] login  
- [ ] business create  
- [ ] invite create / resend / cancel  
- [ ] party create / update / close  
- [ ] business disable / enable / soft-delete / restore  

### BUSINESS_ADMIN

- [ ] invite accept  
- [ ] login  
- [ ] own party CRUD  
- [ ] cross-tenant block  
- [ ] after business disable: refresh/login blocked  

---

## 4. Consumer App

- [ ] Google login  
- [ ] Apple login  
- [ ] session restore  
- [ ] refresh rotation  
- [ ] logout  
- [ ] revoked session reconnect blocked  

---

## 5. Outbox failure recovery

- [ ] provider 500 → retry  
- [ ] provider 400 → DEAD  
- [ ] worker stop → lock reclaim  
- [ ] invite resend → stale mail cancel  
- [ ] reprocess DEAD → SENT  

---

## 6. Legacy BFF traffic

Scrape: `GET {admin}/api/metrics/legacy-bff`  
(optional `LEGACY_BFF_METRICS_TOKEN`)

- [ ] After E2E: series for `super_admin_businesses*`, `*_parties*` stay **0**  
- [ ] Any non-zero route → find caller → fix before prod  

Inventory lifecycle: `docs/LEGACY_BFF_INVENTORY.md`

---

## 7. Production approval packet (short)

```
Release scope
- Consumer Auth v2
- Admin Auth v2
- NextAuth removal
- Business / Invite / Party on Nest
- Mail Outbox / Worker

Validation
- backend tests: 70
- admin tests: 33 (+ metrics)
- tsc: passed
- staging E2E: ___
- cross-tenant: ___
- Google/Apple: ___
- outbox recovery: ___
- legacy_bff_requests_total (staging post-E2E): 0 for 2026-08 group

Rollback
- previous Nest image
- previous Admin image
- DB migrations backward-compat: ___
- traffic switch / flag: ___

Known residual
- legacy BFF inventory (RESIDUAL → delete after 14d prod zero)
- planned: 2026-08 businesses/parties/invites BFF
```

---

## 8. After production

- [ ] 14 days prod zero on 2026-08 group → **READY_TO_DELETE**  
- [ ] Delete PR for those routes  
- [ ] Mark **REMOVED** in inventory  

Do **not** invent more auth features until the checklist is filled with evidence.
