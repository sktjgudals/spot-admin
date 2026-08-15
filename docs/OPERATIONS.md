# DOPA Admin 운영 정본

마지막 갱신: 2026-08-15

이 문서는 `spot-admin`의 현재 기능·라우트·인증·배포·검증 기준을 한곳에 기록한다.
과거 구현 메모나 릴리스별 체크리스트보다 현재 코드, 테스트와 이 문서를 우선한다.

## 운영 상태

| 항목                      | 현재 값                                              |
| ------------------------- | ---------------------------------------------------- |
| Production Worker         | `dopa-admin`                                         |
| Production URL            | `https://admin.dopa.ing`                             |
| Production Worker version | `0ac6c295-6ebe-48c9-bad8-30d82080e8be`               |
| API                       | `https://api.dopa.ing`                               |
| WebSocket                 | `wss://api.dopa.ing/v2/chat`                         |
| Staging Worker            | `dopa-admin-staging`                                 |
| Staging API               | `https://dopa-backend-staging.ceoofspot.workers.dev` |

2026-08-15 운영 배포 뒤 `/`, `/login`, `/icon.png`, `/dopa-logo.png`는 HTTP 200,
비로그인 `/super-admin/dashboard`는 `/login`으로 307 응답했다. 주요 화면 smoke 중 Worker
오류 로그는 발생하지 않았다.

## 런타임 경계

- Admin 인증과 모든 업무 API는 `spot-cloudflare-backend`가 제공한다.
- 브라우저 access token은 메모리에 두고 refresh session은 API origin의 HttpOnly cookie로
  관리한다.
- 가입 성공 응답의 세션을 `AdminAuthProvider`에 적용한 뒤 `authenticated` 상태가 확정되면
  역할별 홈으로 이동한다.
- `SUPER_ADMIN` 전역 조회는 `/admin/v2/*`와 `DB_ADMIN_00` projection을 사용한다.
- 업체 명령은 원본 identity/platform/domain 저장소에서 처리하고 감사 로그와 projection
  이벤트를 남긴다.
- Admin Worker에는 Prisma, Prisma 생성 타입, `DATABASE_URL`, 직접 D1 binding이 없다.
- 활성 `/api/super-admin/*` Route Handler나 레거시 BFF 호출은 허용하지 않는다.

## 라우트와 권한

| 화면                            | 권한             | 정식 경로                              |
| ------------------------------- | ---------------- | -------------------------------------- |
| 로그인·가입·비밀번호 재설정     | Public           | `/login`, `/signup`, `/reset-password` |
| 슈퍼어드민 대시보드             | `SUPER_ADMIN`    | `/super-admin/dashboard`               |
| 업체 목록·상세·초대·업체별 파티 | `SUPER_ADMIN`    | `/app/businesses/*`                    |
| 전역 관리 콘솔                  | `SUPER_ADMIN`    | `/super-admin/:section`                |
| 업체 운영 홈·내 업체            | `BUSINESS_ADMIN` | `/app`, `/app/my`                      |
| 업체 파티·신청·체크인           | `BUSINESS_ADMIN` | `/app/parties/*`                       |
| 업체 채팅·리뷰                  | `BUSINESS_ADMIN` | `/app/chat/*`, `/app/reviews`          |

전역 관리 콘솔은 사용자 제재, 업체 권한 신청, 환불 정책 변경, 결제·환불, 쿠폰, 문의,
알림 캠페인, 배너, 파티 카테고리, 리뷰 태그, 런타임 설정을 제공한다. 모든 요청은
`requireUser`와 서버의 역할 검사를 통과해야 한다.

## 관리자 API 규약

- base path: `/admin/v2`
- 목록 응답: `{ items, nextCursor, asOf }`
- 오류 응답: `{ code, message, traceId }`
- 변경 응답: 최신 리소스와 `auditId`
- read model 허용 지연: 최대 60초

대시보드는 `GET /admin/v2/dashboard/summary`를 사용한다. 조회 실패는 전체 Next.js 오류
화면으로 전파하지 않고 카드 또는 화면 단위 오류와 재시도를 표시한다.

업체 어드민은 업체 생성 또는 상세 화면에서 기존 사용자 이름·이메일을 2자 이상 검색해
할당한다. 후보 조회는 `GET /admin/v2/business-operator-candidates`, 할당은
`POST /admin/v2/businesses/:businessId/operators`를 사용한다. 이미 다른 업체에 활성 할당된
사용자는 선택할 수 없으며, 같은 업체에 대한 재요청은 멱등하게 성공한다. 초대 메일은 기존
사용자 검색으로 찾을 수 없는 신규 담당자를 위한 별도 흐름으로 유지한다.

## 검증

```bash
npm run verify
git diff --check
```

`npm run verify`는 Vitest, release gate, runtime boundary 검사, ESLint와 staging OpenNext
빌드를 실행한다. 2026-08-15 기준 Vitest 47개, release test 8개와 production build가
통과했다.

수동 E2E 최소 범위:

1. 신규 가입 → 세션 확정 → 역할별 홈 이동. 중복 로그인·초기 만료 메시지가 없어야 한다.
2. 기존 계정 로그인, hard reload, refresh, logout, 만료·폐기 세션을 확인한다.
3. `SUPER_ADMIN`은 전체 콘솔을 사용할 수 있고 다른 역할은 `/admin/v2/*`에서 403이어야 한다.
4. 업체·파티·초대와 각 관리 콘솔의 목록, 생성, 수정, 승인, 거절, 재시도를 확인한다.
5. 기존 사용자를 이름·이메일로 검색해 업체에 할당하고, 해당 계정이 업체 운영 홈에
   접근하는지 확인한다. 다른 업체에 이미 할당된 사용자는 409여야 한다.
6. 업체 A 계정으로 업체 B의 파티·템플릿·신청·채팅에 접근할 수 없어야 한다.
7. 브라우저 콘솔과 Workers tail에서 새 5xx와 인증 반복 요청이 없어야 한다.

## 배포와 롤백

Staging:

```bash
npm run verify
npm run cf:deploy:staging:plan
DOPA_ADMIN_STAGING_DEPLOY_ACK=I_ACKNOWLEDGE_STAGING_ADMIN_DEPLOY \
  npm run cf:deploy:staging
```

Production:

```bash
npm run cf:deploy:production
```

Production 명령은 `api.dopa.ing`과 `wss://api.dopa.ing/v2/chat`을 주입해 OpenNext를 새로
빌드하고 `wrangler.production.jsonc`로 배포한다. staging 산출물을 재사용하지 않는다.

배포 후 확인:

```bash
curl -I https://admin.dopa.ing/login
curl -I https://admin.dopa.ing/super-admin/dashboard
curl -I https://admin.dopa.ing/icon.png
npx wrangler deployments list --config wrangler.production.jsonc
```

치명적 5xx, 인증 실패 증가 또는 API projection 지연 60초 초과 시 신규 버전 승격을
중단하고 Cloudflare Deployments에서 직전 정상 Worker version으로 롤백한다. D1 additive
migration과 rebuild 가능한 projection 데이터는 롤백 시 유지한다.
