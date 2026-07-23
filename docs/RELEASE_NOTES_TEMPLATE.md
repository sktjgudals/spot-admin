# Release notes (1 page) — Staging PASS 후 작성

**버전 / 날짜:** _______________  
**환경:** staging → production  
**작성자:** _______________  

---

## 1. 변경 사항 (scope)

| 영역 | 내용 |
|------|------|
| Consumer Auth v2 | JWT/session/refresh · Google/Apple (해당 시) |
| Admin Auth v2 | email login · cookie refresh · `/me` · bootstrap/invite/reset |
| NextAuth | **제거** (Admin Web) |
| Business / Invite / Party | Nest `/admin/v2/*` + AuthShell UI |
| Mail | Transactional outbox + worker |
| Legacy | BFF residual inventory · metrics · UI redirect |

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
| Legacy BFF metrics (post-E2E, 대상 route) | ☐ ~0 (A8) |

**증적 폴더:** `docs/e2e-evidence/staging-____-__-__/`

---

## 3. 알려진 잔여 항목

| 항목 | 상태 | 계획 |
|------|------|------|
| Legacy BFF (users, banners, …) | RESIDUAL | `LEGACY_BFF_INVENTORY.md` · 2026-08 1차 삭제 후보: businesses/parties/invites BFF |
| 미이전 Admin 기능 (배너/유저 UI 등) | redirect away | 이후 Nest 이전 |
| Outbox 실메일 provider | staging 정책에 따름 | production provider 확인 |

---

## 4. 롤백

| 대상 | 방법 |
|------|------|
| Nest API | 이전 컨테이너 이미지 재배포 |
| Admin Web | 이전 이미지 재배포 |
| DB | 마이그레이션 하위 호환: ____ (가역/비가역 명시) |
| 트래픽 | ____ (있다면) |

**주의:** Auth v2 쿠키/세션은 롤백 이미지와 호환 여부 확인.

---

## 5. 승인 요청

- [ ] Staging overall **PASS**
- [ ] 증적 A1–A8 첨부/링크
- [ ] 롤백 담당자 확인: ________
- [ ] Production 배포 창: ________

**요청:** Production clean cutover 승인  

**승인자 / 일자:** ________ / ________  
