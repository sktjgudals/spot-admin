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
| 사용자 상세·플로우·행동(GA4)    | `SUPER_ADMIN`    | `/super-admin/users/:id`               |
| 업체 운영 홈·내 업체            | `BUSINESS_ADMIN` | `/app`, `/app/my`                      |
| 업체 인사이트                   | `BUSINESS_ADMIN` | `/app/insights`                        |
| 업체 파티·신청·체크인           | `BUSINESS_ADMIN` | `/app/parties/*`                       |
| 업체 채팅·리뷰                  | `BUSINESS_ADMIN` | `/app/chat/*`, `/app/reviews`          |

전역 관리 콘솔은 사용자 제재, 업체 권한 신청, 환불 정책 변경, 결제·환불, 쿠폰, 문의,
알림 캠페인, 배너, 파티 카테고리, 리뷰 태그, 런타임 설정을 제공한다. 모든 요청은
`requireUser`와 서버의 역할 검사를 통과해야 한다.

배너 이미지는 "배너 추가/수정" 다이얼로그에서 파일을 직접 올린다(SUPER_ADMIN 전용 `POST /admin/v2/media/upload-url` → R2 `banners/` → `https://media.dopa.ing/banners/…`). 권장 크기 1600×900(16:9), jpeg/png/webp 10MB 이하, 업로드 전 브라우저가 1920px로 리사이즈한다. 외부 호스팅 이미지는 URL 직접 입력으로도 저장할 수 있다. 노출 시작/종료를 비우면 무제한 노출이며, 수정 화면에서 비우면 일정이 해제된다. 기존 배너의 이미지는 "이미지 교체"로 바꾼다.

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
- OAuth access token은 브라우저 메모리에만 유지하고 로그아웃·관리자 세션 교체·연결 해제·만료
  시 제거한다. 탭을 닫거나 새로고침하면 사라진다. 화면을 이동한다고 버리지는 않는다 —
  분석 화면과 사용자 상세 화면을 오갈 때마다 Google 동의 창이 다시 뜨면 조사가 끊긴다.
  localStorage, sessionStorage, cookie, URL, 로그, Sentry에는 기록하지 않는다.
- 화면은 개요, 유입, 참여, 전환·매출, 퍼널, 리텐션, 실시간 보고서를 제공한다. 결제 이벤트나
  UTM 등 소스 이벤트가 GA4에 수집되지 않은 경우에는 0을 실제 비즈니스 성과로 단정하지 않고
  명시적인 빈 상태를 표시한다.
- 표의 `전체` 건수는 Data API의 `rowCount`이며 요청의 표시 제한과 독립적이다. 화면에는
  현재 내려받은 상위 N개와 전체 결과 수를 분리해 표시한다. `subjectToThresholding`,
  `samplingMetadatas`, `dataLossFromOtherRow`가 반환되면 해당 보고서에 개인정보 보호 임계값,
  표본 비율, `(other)` 행 병합 안내를 노출한다. 이 신호가 있는 수치를 완전한 원시 집계로
  해석하지 않는다.
- 이 기능을 실제 데이터로 검증하려면 위 Google Cloud 설정, 실제 Property ID, 운영자
  계정의 권한이 별도로 준비되어야 한다. 저장소 빌드 성공은 이 외부 설정 완료의 증거가 아니다.

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
- 코호트 주(일~토)의 경계는 운영자 브라우저의 로컬 달력 기준이라 GA4 속성 시간대와 다를 수
  있고(일별 추세 창의 마지막 날짜도 같은 기준이다), 그 차이는 경계 하루만큼의 어긋남으로
  나타난다.
- 인사이트 요약 임계값: 합계 지표는 이전 기간 50명 이상 + 20% 이상 변화, 참여율은 5%p,
  플랫폼은 이전 기간 30명 이상 + 25% 이상 변화, 플랫폼 비중은 10%p. 최대 5개를 보여준다.
  아무 규칙도 걸리지 않고 비교 기준마저 작으면 "판단하지 않았다"고 명시한다.
- 개요의 일별 추세와 플랫폼 비교는 한 요청에 기간 두 개를 넣는다. GA4는 이때 `dateRange`
  측정기준을 응답 끝에 덧붙인다. 화면은 그 값이 요청에 준 이름이든 `date_range_0` 형태이든
  받아들이고, 둘 다 아니면 그 행을 버린다. 잘못 배정된 행 하나가 비교 전체를 한 기간
  밀어버리기 때문이다.
- 실시간 보고서에는 필터가 적용되지 않는다. 필터 바에 그렇게 표시된다.
- 지표·측정기준 조합이 유효한지 확신이 서지 않으면 Data API의 `checkCompatibility`로 확인한다.

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
