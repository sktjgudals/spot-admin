# Release notes (1 page) — Staging PASS 후 작성

**버전 / 날짜:** _______________  
**환경:** staging → production  
**작성자:** _______________  

---

## 1. 변경 사항 (scope)

| 영역 | 내용 |
|------|------|
| Consumer Auth | JWT/session/refresh · Google/Apple (해당 시) |
| Admin Auth | email login · cookie refresh · `/me` · bootstrap/invite/reset |
| Business / Invite / Party | Cloudflare `/admin/v2/*` + Admin UI |
| Mail | Transactional outbox + worker |
| Runtime boundary | Admin Web DB/BFF dependency 0 |

---

## 2. 검증 결과

| 항목 | 결과 |
|------|------|
| Backend unit tests | 70 (기록 시점) |
| Admin unit tests | 35 (기록 시점) |
| TypeScript | passed |
| Staging E2E (`STAGING_E2E_CHECKLIST.md`) | ☐ PASS / ☐ FAIL — 일자: ____ |
| Cross-tenant | ☐ PASS |
| Cookie / no body refreshToken / no localStorage token | ☐ PASS (증적 A1–A3) |
| Password reset session revoke | ☐ PASS (A7) |
| Outbox recovery | ☐ PASS / ☐ CONDITIONAL |
| Google / Apple | ☐ PASS / ☐ SKIP |
| Runtime boundary release gate | ☐ PASS (A8) |

**증적 폴더:** `docs/e2e-evidence/staging-____-__-__/`

---

## 3. 알려진 잔여 항목

| 항목 | 상태 | 계획 |
|------|------|------|
| 미구현 Admin 기능 | 메뉴 비노출 | Cloudflare API와 UI를 같은 배치로 제공 |
| Outbox 실메일 provider | staging 정책에 따름 | production provider 확인 |

---

## 4. 롤백

| 대상 | 방법 |
|------|------|
| Cloudflare API | 직전 Worker 버전으로 트래픽 복구 |
| Admin Web | 직전 Worker 버전으로 트래픽 복구 |
| DB | 마이그레이션 하위 호환: ____ (가역/비가역 명시) |
| 트래픽 | ____ (있다면) |

**주의:** 관리자 쿠키/세션은 롤백 버전과 호환 여부 확인.

---

## 5. 승인 요청

- [ ] Staging overall **PASS**
- [ ] 증적 A1–A8 첨부/링크
- [ ] 롤백 담당자 확인: ________
- [ ] Production 배포 창: ________

**요청:** Production clean cutover 승인  

**승인자 / 일자:** ________ / ________  
