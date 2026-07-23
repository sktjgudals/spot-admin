# Staging E2E 수동 시나리오 체크리스트

**목적:** Production 승인용 **증적** 확보. 코드 커밋 수가 아니라 이 문서의 체크 + 캡처가 게이트다.

**전제:** Staging에 Nest Auth v2 + Worker + Admin Web(NextAuth 제거본) 배포 완료.

**관련 문서**
- `docs/OPS_NEXT_STEPS.md`
- `docs/LEGACY_BFF_INVENTORY.md`
- Nest: `docs/AUTH_V2_ADMIN_ROADMAP.md`

---

## 0. 증적 규칙

| 규칙 | 내용 |
|------|------|
| 저장 위치 | `docs/e2e-evidence/staging-YYYY-MM-DD/` (로컬·공유 드라이브; **토큰·비밀번호 캡처 금지**) |
| 파일명 | `01-cookies.png`, `02-localstorage.png`, … (아래 번호 따름) |
| 민감 정보 | accessToken / refreshToken / cookie 값 / 이메일은 **마스킹** 또는 값 영역 crop |
| 실패 시 | 체크 칸에 `FAIL` + 시각 + 응답 코드 + 요청 path만 기록 (body 전체 금지) |
| 판정 | 섹션 단위 PASS/FAIL. 하나라도 치명 FAIL이면 Production 승인 보류 |

### 필수 증적 목록 (승인 시 첨부)

| # | 증적 | 섹션 |
|---|------|------|
| A1 | 로그인 후 `spot_admin_*` 쿠키만 존재 | §2 |
| A2 | localStorage / sessionStorage 토큰 0 | §2 |
| A3 | Network: `/auth/v2/admin/refresh` 응답 body에 `refreshToken` 없음 | §2 |
| A4 | SUPER_ADMIN 권한 시나리오 결과표 | §3 |
| A5 | BUSINESS_ADMIN + cross-tenant 차단 | §4 |
| A6 | Outbox PENDING → SENT (또는 dev console 경로 명시) | §6 |
| A7 | Password reset 후 기존 세션 무효화 | §5 |
| A8 | Legacy BFF metrics ≈ 0 (대상 route) | §7 |

---

## 1. 환경·헬스 (Backend)

| # | 확인 | 방법 | PASS | 증적 |
|---|------|------|------|------|
| 1.1 | API live | `GET {NEST}/health/live` → 2xx | ☐ | 응답 코드 메모 |
| 1.2 | API ready | `GET {NEST}/health/ready` → 2xx | ☐ | |
| 1.3 | DB | ready 또는 운영 대시보드 | ☐ | |
| 1.4 | Redis | ready / 세션 생성 성공으로 간접 확인 | ☐ | |
| 1.5 | Worker | Outbox poll 로그 또는 메일 SENT | ☐ | |

**Env 기록 (값 전체 붙여넣지 말 것)**

| 변수 | 설정 여부 |
|------|-----------|
| Admin `NEXT_PUBLIC_API_URL` | ☐ |
| Nest CORS Admin origin exact + credentials | ☐ |
| `ADMIN_INVITE_TOKEN_RESPONSE_ENABLED` staging=false | ☐ |
| Outbox crypto key / worker enabled | ☐ |

---

## 2. Admin 세션·쿠키·CORS (브라우저)

**브라우저:** Chromium 계열 권장. DevTools → Application + Network.

| # | 시나리오 | 기대 | PASS | 증적 |
|---|----------|------|------|------|
| 2.1 | 시크릿 창 → Admin staging `/login` | 로그인 폼 (booting 후 깜빡임 최소) | ☐ | |
| 2.2 | SUPER_ADMIN 로그인 | `/app/businesses` 등 role home | ☐ | |
| 2.3 | Application → Cookies (Nest **API 호스트**) | `spot_admin_rt`, `spot_admin_sid`, `spot_admin_aid` 존재 · **HttpOnly** | ☐ | **A1** (값은 가림) |
| 2.4 | 같은 창 Cookies (Admin 호스트) | NextAuth / authjs 쿠키 **없음** | ☐ | A1과 구분 캡처 가능 |
| 2.5 | Application → Local Storage / Session Storage | access/refresh 토큰 키 **0** | ☐ | **A2** |
| 2.6 | Network → `POST .../auth/v2/admin/login` | Request credentials include · Response JSON에 `accessToken` · **`refreshToken` 필드 없음** (`refreshDelivery: cookie`) | ☐ | |
| 2.7 | 하드 리로드 (F5) | booting → authenticated 유지 (깜빡임 후 home) | ☐ | |
| 2.8 | Network → `POST .../auth/v2/admin/refresh` (리로드 시) | 요청 Cookie에 spot_admin_* · **응답 body에 refreshToken 없음** · Set-Cookie 회전 가능 | ☐ | **A3** |
| 2.9 | CORS 실패 없음 | Console에 CORS error 0 · preflight Allow-Credentials true | ☐ | |

**2.x 섹션 판정:** ☐ PASS / ☐ FAIL  

---

## 3. SUPER_ADMIN 전체 흐름

| # | 시나리오 | 기대 | PASS | 비고 |
|---|----------|------|------|------|
| 3.1 | `GET /auth/v2/admin/me` | role SUPER_ADMIN, businessId null | ☐ | Network |
| 3.2 | 업체 목록 `/app/businesses` | Nest `GET /admin/v2/businesses` 200 | ☐ | |
| 3.3 | 업체 생성 | 생성 후 상세로 이동 | ☐ | 테스트 업체명 기록 |
| 3.4 | 초대 생성 | PENDING 행 · (outbox 적재) | ☐ | email 마스킹 |
| 3.5 | 초대 resend | resendCount↑ · tokenVersion↑ · 메일 status 갱신 | ☐ | |
| 3.6 | 초대 cancel (별도 PENDING 또는 resend 후 새 것) | REVOKED | ☐ | |
| 3.7 | 파티 생성 (URL scope) | `/app/businesses/{id}/parties` · Nest path에 동일 businessId | ☐ | |
| 3.8 | 파티 수정 | PATCH 200 | ☐ | |
| 3.9 | 파티 soft-close | isActive false / CLOSED | ☐ | |
| 3.10 | Business disable | status DISABLED · 해당 업체 BA 세션 폐기(§4) | ☐ | |
| 3.11 | Business enable | ACTIVE (deleted 아닌 경우) | ☐ | |
| 3.12 | Business soft-delete | deletedAt set · DISABLED | ☐ | |
| 3.13 | Business restore | deletedAt null · ACTIVE | ☐ | |

**3.x 섹션 판정:** ☐ PASS / ☐ FAIL  
**증적 A4:** 위 표를 채운 스크린샷 또는 체크 완료본 복사.

---

## 4. BUSINESS_ADMIN · Tenant isolation

**준비:** 유효 초대 accept 또는 기존 ACTIVE BUSINESS_ADMIN · businessId 기록 (마스킹).

| # | 시나리오 | 기대 | PASS | 증적 |
|---|----------|------|------|------|
| 4.1 | Invite accept (또는 기존 계정 login) | `/app/parties` · me.businessId 존재 | ☐ | |
| 4.2 | Own party list/create/update | Nest `.../businesses/{me.businessId}/parties` 만 사용 | ☐ | Network path 확인 |
| 4.3 | Soft-close own party | 성공 | ☐ | |
| 4.4 | UI: `/app/businesses` 직접 접근 | RoleGuard 차단 / SUPER 전용 | ☐ | |
| 4.5 | UI: 타 업체 `/app/businesses/{otherId}/parties` | SUPER only 또는 redirect · BA 데이터 노출 0 | ☐ | |
| 4.6 | API: 타 businessId로 list parties (Bearer BA) | **403** `BUSINESS_SCOPE_MISMATCH` 등 | ☐ | **A5** status + path only |
| 4.7 | API: 타 partyId patch/delete | **403** 또는 NOT_FOUND 정책 일치 | ☐ | A5 |
| 4.8 | SUPER가 BA business disable 후 | BA **refresh 실패** (401) · **login 실패** (동일 메시지) | ☐ | §3.10 연동 |

**4.x 섹션 판정:** ☐ PASS / ☐ FAIL  

---

## 5. Password reset · 세션 무효화

| # | 시나리오 | 기대 | PASS | 증적 |
|---|----------|------|------|------|
| 5.1 | 세션 A로 로그인 유지 (별 탭) | authenticated | ☐ | |
| 5.2 | Password reset request → verify → complete | 성공 메시지 | ☐ | 코드/토큰 캡처 금지 |
| 5.3 | 세션 A로 API 호출 또는 refresh | **401 / 세션 무효** | ☐ | **A7** |
| 5.4 | 새 비밀번호로 login | 성공 · 새 쿠키 | ☐ | |

**5.x 섹션 판정:** ☐ PASS / ☐ FAIL  

---

## 6. Outbox / Worker

| # | 시나리오 | 기대 | PASS | 증적 |
|---|----------|------|------|------|
| 6.1 | Invite create 후 Admin 초대 목록 “메일” 컬럼 | PENDING → **SENT** (worker 동작 시) | ☐ | **A6** |
| 6.2 | (가능 시) provider 500 시뮬 | retry · attempts↑ | ☐ | |
| 6.3 | (가능 시) permanent 400 | DEAD | ☐ | |
| 6.4 | Invite resend | 이전 outbox CANCELLED · 새 row · tokenVersion 불일치 시 발송 안 함 | ☐ | |
| 6.5 | DEAD reprocess (SUPER) | PENDING 복귀 후 SENT | ☐ | |

Worker 미기동 staging이면 6.1을 `PENDING only + worker 미기동`으로 명시하고 **조건부 PASS**.

**6.x 섹션 판정:** ☐ PASS / ☐ FAIL / ☐ CONDITIONAL  

---

## 7. Legacy BFF metrics

```bash
# 값 마스킹. token 필요 시 env만 사용
curl -sS "${ADMIN_STAGING_URL}/api/metrics/legacy-bff" | head -50
# 또는
curl -sS "${ADMIN_STAGING_URL}/api/metrics/legacy-bff?format=json"
```

| # | 확인 | 기대 | PASS | 증적 |
|---|------|------|------|------|
| 7.1 | Admin E2E **직후** scrape | `super_admin_businesses*`, `*_parties*`, invite BFF route **0** 또는 E2E가 BFF를 안 탄 경우 증가 0 | ☐ | **A8** |
| 7.2 | 의도적으로 구 BFF 호출 시 | 해당 **정규화 route** 카운트 증가 (PII 라벨 없음) | ☐ | optional |

**7.x 섹션 판정:** ☐ PASS / ☐ FAIL  

---

## 8. Consumer (모바일) — 별도 앱 빌드

| # | 시나리오 | 기대 | PASS |
|---|----------|------|------|
| 8.1 | Google login | consumer JWT + session | ☐ |
| 8.2 | Apple login | 동일 | ☐ |
| 8.3 | Kill/reopen restore | session 유지 또는 정책 일치 | ☐ |
| 8.4 | Refresh rotation | 정상 · 재사용 거부 | ☐ |
| 8.5 | Logout | 이후 API 401 | ☐ |
| 8.6 | Revoked session reconnect | 차단 | ☐ |

**8.x 섹션 판정:** ☐ PASS / ☐ FAIL / ☐ SKIP (이번 cutover 범위 외 시 사유)  

---

## 9. 결과 요약 (승인 입력용)

| 영역 | 판정 | 일자 | 수행자 |
|------|------|------|--------|
| §1 Backend health | ☐ P / ☐ F | | |
| §2 Cookies / CORS | ☐ P / ☐ F | | |
| §3 SUPER_ADMIN | ☐ P / ☐ F | | |
| §4 BUSINESS_ADMIN / isolation | ☐ P / ☐ F | | |
| §5 Password reset sessions | ☐ P / ☐ F | | |
| §6 Outbox | ☐ P / ☐ F / ☐ C | | |
| §7 Legacy BFF metrics | ☐ P / ☐ F | | |
| §8 Consumer | ☐ P / ☐ F / ☐ S | | |

**Overall staging:** ☐ **PASS** / ☐ **FAIL**  

**Overall PASS 조건:** §1–§5, §7 필수 PASS. §6 conditional 허용(사유 명시). §8은 이번 승인 범위에 포함 시 필수.

---

## 10. 다음 문서 작업 (E2E 후)

1. 본 체크리스트 결과 표 + 증적 A1–A8 링크  
2. **1페이지 릴리즈 노트** (`docs/RELEASE_NOTES_TEMPLATE.md` 사용)  
3. Production 승인 요청  
4. (prod 14일 metrics 0 후) 2026-08 BFF 삭제 PR  

---

## 부록: 빠른 curl (SUPER 토큰은 환경변수, 출력 로그에 남기지 말 것)

```bash
# login (cookie jar)
curl -sS -c /tmp/sa.cj -X POST "$NEST/auth/v2/admin/login" \
  -H 'content-type: application/json' \
  -d '{"email":"…","password":"…","useCookie":true}' 

# me (Authorization: Bearer from login JSON — 셸 history 주의)
# businesses list
# …
```

수동 UI 경로를 기본으로 하고, curl은 보조로만 사용.
