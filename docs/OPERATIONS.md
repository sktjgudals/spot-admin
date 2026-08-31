# DOPA Admin 운영 정본

마지막 갱신: 2026-09-01

이 문서는 `spot-admin`의 현재 기능·라우트·인증·배포·검증 기준을 한곳에 기록한다.
과거 구현 메모나 릴리스별 체크리스트보다 현재 코드, 테스트와 이 문서를 우선한다.

## 운영 상태

| 항목                      | 현재 값                                              |
| ------------------------- | ---------------------------------------------------- |
| Production Worker         | `dopa-admin`                                         |
| Production URL            | `https://admin.dopa.ing`                             |
| Production Worker version | `94de5fae-a818-43ab-b24f-c41d0fba5150`               |
| Production source commit  | `99ba954`                                            |
| API                       | `https://api.dopa.ing`                               |
| WebSocket                 | `wss://api.dopa.ing/v2/chat`                         |
| Staging Worker            | `dopa-admin-staging`                                 |
| Staging API               | `https://dopa-backend-staging.ceoofspot.workers.dev` |

2026-08-26 라이브는 git `99ba954`, Worker `94de5fae`(100%, Wrangler deployment
list로 확인)이다. `/login`은 HTTP 200이고 CSP·HSTS가 응답에 있다.
`/super-admin/dashboard`는 비로그인 시 `/login`으로 307이다. 원격 `BUILD_ID`는 배포한
production 산출물과 일치한다. PR #18의 업체별 결제·정산 콘솔과 PR #19의 fail-closed
런타임 상태 표시, PR #21의 Apple 웹 로그인이 이 버전에 있다. 직전 정상 version은
`09ec4530`이다. 실계정으로 결제 운영
프로필을 조회·변경한 확인은 아직 없다.

업체 담당자 웹 로그인: 앱과 같은 Google 웹 클라이언트
(`109162230288-9644lmdagmid6oc5bqttoq2q9asnigji`)로 `POST /auth/v2/admin/oidc-login`.
신규 유저는 만들지 않고, 배정된 ADMIN만 세션을 준다. Apple 버튼은
`NEXT_PUBLIC_APPLE_CLIENT_ID=ing.dopa.admin.web`로 빌드되며, Services ID는
`com.hyeongmin.dopa`에 연결돼 있다.
초대 비밀번호와 `@dopa.ing` 슈퍼 어드민 폼은 그대로다. Google Cloud 웹
클라이언트에는 production·staging·localhost JavaScript origin이 저장돼 있다. OAuth 앱의
홈페이지·개인정보처리방침·서비스 약관은 `www.dopa.ing` 공개 URL로 저장했고 게시 상태는
`프로덕션 단계`다. 모든 Google 계정이 OAuth 화면을 사용할 수 있어도 서버는 기존 사용자와
ADMIN·업체 배정을 다시 검사하므로 Admin 권한이 자동 생성되지는 않는다. API
production release는 `e6872e3`, 최종 Secret Change Worker는 `e34b0baa`이며 Apple audience는
기존 iOS 번들과 Admin Services ID를 함께 허용한다. Apple authorization 화면 진입까지
확인했고 실계정 선택·토큰 전송 E2E는 별도 개인정보 확인이 필요하다.

콘솔 origin·Apple Services ID·production 배포 체크리스트는
[ADMIN_OIDC_HANDOFF.md](ADMIN_OIDC_HANDOFF.md)다. 다른 에이전트에 이 파일만 넘기면 된다.

## 런타임 경계

- Admin 인증과 모든 업무 API는 `spot-cloudflare-backend`가 제공한다.
- 운영 로그인은 자격 증명을 전송하기 전에 `api.dopa.ing/health`를 확인한다. custom domain이
  연결되지 않으면 같은 production Worker의
  `dopa-backend.ceoofspot.workers.dev`로 전환하고 선택한 origin을 유지해 refresh cookie가
  같은 호스트로 전달되게 한다.
- 브라우저 access token은 메모리에 두고 refresh session은 API origin의 HttpOnly cookie로
  관리한다.
- 메모리 세션은 access token과 `admin.id + 정규화된 role + businessId` 주체 지문을 함께
  보관한다. refresh cookie가 다른 탭의 로그인으로 교체되어 갱신 응답의 주체가 달라지면 토큰과
  모든 관리자 쿼리 캐시를 폐기하고 원 요청을 재시도하지 않는다.
- 각 Admin API 요청은 세션 generation을 캡처한다. 로그아웃·계정 채택 등으로 generation이
  바뀌면 이미 진행 중이던 응답은 본문 해석과 캐시 갱신 전에 폐기한다. 같은 주체의 access token
  refresh는 generation을 유지해 정상적인 단일 재시도만 허용한다.
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
| 제품 분석(GA4)                  | `SUPER_ADMIN`    | `/super-admin/analytics`               |
| 업체 목록·상세·초대·업체별 파티 | `SUPER_ADMIN`    | `/app/businesses/*`                    |
| 전역 관리 콘솔                  | `SUPER_ADMIN`    | `/super-admin/:section`                |
| 업체 운영 홈·내 업체            | `BUSINESS_ADMIN` | `/app`, `/app/my`                      |
| 업체 인사이트                   | `BUSINESS_ADMIN` | `/app/insights`                        |
| 업체 파티·신청·체크인           | `BUSINESS_ADMIN` | `/app/parties/*`                       |
| 업체 채팅·리뷰                  | `BUSINESS_ADMIN` | `/app/chat/*`, `/app/reviews`          |

전역 관리 콘솔은 사용자 제재, 업체 권한 신청, 환불 정책 변경, 결제·환불, 쿠폰, 문의,
알림 캠페인, 배너, 파티 카테고리, 리뷰 태그, 런타임 설정을 제공한다. 모든 요청은
`requireUser`와 서버의 역할 검사를 통과해야 한다.

### Google Analytics 4 제품 분석

`/super-admin/analytics`는 Dopa 백엔드나 Admin Worker를 경유하지 않고 브라우저에서
Google Analytics Data API의 읽기 전용 보고서를 조회한다. 기존
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`와 다음 공개 빌드 설정을 사용한다.

```dotenv
NEXT_PUBLIC_GA4_PROPERTIES='[{"id":"123456789","label":"Dopa Web","platform":"web"},{"id":"987654321","label":"Dopa App","platform":"mixed"}]'
```

이 값은 Next.js가 클라이언트 번들에 인라인하는 **build-time** 설정이다. staging 배포는
GitHub `staging` Environment의 공개 **GitHub Environment variable**
`NEXT_PUBLIC_GA4_PROPERTIES`를 빌드 프로세스에 전달한다. production 수동 빌드도 같은 이름의
환경 변수가 없거나 계약에 맞지 않으면 Worker 산출물을 만들기 전에 실패한다. Wrangler의
runtime `vars`만 바꾸는 것으로는 이미 생성된 클라이언트 번들이 갱신되지 않는다.

- 각 `id`는 GA4의 숫자 Property ID다. `platform`은 `web`, `ios`, `android`, `mixed` 중
  하나이며 설정은 최대 20개까지 허용한다. 이 값들은 공개 식별자이지 자격 증명이 아니다.
- Google Cloud 프로젝트에서 Google Analytics Data API를 활성화하고 OAuth 동의 화면에
  `https://www.googleapis.com/auth/analytics.readonly` 범위를 허용해야 한다.
- 접속한 Google 계정에는 대상 속성의 Viewer 이상 권한이 있어야 한다. 속성별 권한 오류는
  다른 속성의 보고서를 막지 않는다.
- OAuth access token은 브라우저 메모리에만 유지하고 화면 이탈·연결 해제·만료 시 제거한다.
  localStorage, sessionStorage, cookie, URL, 로그, Sentry에는 기록하지 않는다.
- 화면은 개요, 유입, 참여, 전환·수익, 실시간 보고서를 제공한다. 결제 이벤트나 UTM 등
  소스 이벤트가 GA4에 수집되지 않은 경우에는 0을 실제 비즈니스 성과로 단정하지 않고
  명시적인 빈 상태를 표시한다.
- 표의 `전체` 건수는 Data API의 `rowCount`이며 요청의 표시 제한과 독립적이다. 화면에는
  현재 내려받은 상위 N개와 전체 결과 수를 분리해 표시한다. `subjectToThresholding`,
  `samplingMetadatas`, `dataLossFromOtherRow`가 반환되면 해당 보고서에 개인정보 보호 임계값,
  표본 비율, `(other)` 행 병합 안내를 노출한다. 이 신호가 있는 수치를 완전한 원시 집계로
  해석하지 않는다.
- 이 기능을 실제 데이터로 검증하려면 위 Google Cloud 설정, 실제 Property ID, 운영자
  계정의 권한이 별도로 준비되어야 한다. 저장소 빌드 성공은 이 외부 설정 완료의 증거가 아니다.

## 관리자 API 규약

- base path: `/admin/v2`
- 목록 응답: `{ items, nextCursor, asOf }`
- 오류 응답: `{ code, message, traceId }`
- 변경 응답: 최신 리소스와 `auditId`
- read model 허용 지연: 최대 60초

대시보드는 `GET /admin/v2/dashboard/summary`를 사용한다. 조회 실패는 전체 Next.js 오류
화면으로 전파하지 않고 카드 또는 화면 단위 오류와 재시도를 표시한다.

업체 인사이트는 `GET /businesses/me/insights`다. 방문·위시는 고유 사용자를 세고,
연령 막대는 0명 구간을 숨기며, 둘 다 비면 `아직 관심 기록이 없어요`를 보여 준다.

업체 어드민은 업체 생성 또는 상세 화면에서 기존 사용자 이름·이메일을 2자 이상 검색해
할당한다. 후보 조회는 `GET /admin/v2/business-operator-candidates`, 할당은
`POST /admin/v2/businesses/:businessId/operators`를 사용한다. 이미 다른 업체에 활성 할당된
사용자는 선택할 수 없으며, 같은 업체에 대한 재요청은 멱등하게 성공한다. 초대 메일은 기존
사용자 검색으로 찾을 수 없는 신규 담당자를 위한 별도 흐름으로 유지한다.

### 업체별 결제·정산 운영

`SUPER_ADMIN`은 `/app/businesses/:businessId`에서 업체별 commerce 프로필을 조회하고 초안
저장, 프로필 활성화, 신규 결제 중지를 수행한다. 서버의 `activationBlockers`가 활성화 가능
여부의 정본이며 Admin은 Secret 값이나 전역 런타임 스위치를 직접 변경하지 않는다.

- 호스트 프로필 `ACTIVE`는 `PAYMENT_NEW_ENABLED=true`를 의미하지 않는다. 전역 스위치가
  `OFF`이면 고객의 신규 결제는 계속 fail-closed다.
- PG 키 모드는 `TEST | LIVE | null`, 지급대행 모드는 `DISABLED | TEST | LIVE`다.
  `DISABLED`에서는 지급대행 준비가 끝난 것으로 표시하거나 활성화 가능하다고 해석하지 않는다.
- 테스트 지급대행은 유효한 법인사업자 셀러만 지원한다. 개인·개인사업자 입력 제한은 업체
  관리자 앱과 백엔드가 집행하며, Admin의 업체 종류만으로 셀러 승인을 추정하지 않는다.
- 라이브 키 발급 후에는 서버 키와 계약 스위치를 교체·검증한다. Admin UI나 저장된 호스트
  프로필에서 키를 입력하거나 노출하지 않는다.

## 검증

```bash
npm run verify
npm run analyze
git diff --check
```

`npm run verify`는 Vitest, release gate, runtime boundary 검사, ESLint와 staging OpenNext
빌드를 실행한다. `npm run analyze`는 배포 없이 Next.js route bundle의 의존성과 크기를
점검하는 수동 성능 게이트다. 테스트 개수와 통과 여부는 현재 실행 결과를 정본으로 삼는다.

수동 E2E 최소 범위:

1. 신규 가입 → 세션 확정 → 역할별 홈 이동. 중복 로그인·초기 만료 메시지가 없어야 한다.
2. 기존 계정 로그인, hard reload, refresh, logout, 만료·폐기 세션을 확인한다.
   서로 다른 두 관리자 계정으로 탭을 나눠 로그인한 뒤 첫 탭의 access token을 만료시켰을 때,
   두 번째 계정의 응답이 첫 탭 캐시에 들어가지 않고 첫 탭이 로그아웃되는지도 확인한다.
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
