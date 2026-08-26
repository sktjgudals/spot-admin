# Admin 소셜 로그인 — GPT/운영 인수인계

다른 에이전트나 사람에게 이 파일만 넘기면 된다. 코드·콘솔 설정·production 배포는
완료됐다. 남은 일은 **승인된 담당자와 미배정 사용자 실계정 확인**이다.

마지막 갱신: 2026-08-26

| 저장소                    | 브랜치 | 커밋                                 |
| ------------------------- | ------ | ------------------------------------ |
| `spot-cloudflare-backend` | `main` | `e6872e3` PR #55, production release |
| `spot-admin`              | `main` | `99ba954` PR #21, production source  |
| `spot-app`                | `main` | `6c3a80b` docs only                  |

앱 경로:

- `/Users/seohyeongmin/Desktop/github/spot-cloudflare-backend`
- `/Users/seohyeongmin/Desktop/github/spot-admin`
- `/Users/seohyeongmin/Desktop/github/spot-app`

---

## 1. 이미 끝난 것 (다시 만들지 말 것)

- Admin `/login`에 Google GIS 버튼이 있다.
- `POST /auth/v2/admin/oidc-login`이 토큰을 검증한다.
- **기존 앱 사용자만** 찾는다. Admin에서 신규 가입을 만들지 않는다.
- `ADMIN` + 업체 배정이 있는 계정만 웹 세션(쿠키)을 받는다.
- 일반 USER Google/Apple은 401.
- 이메일/비밀번호, 초대 수락 로그인은 그대로다.
- Apple 버튼은 Services ID가 없을 때 숨긴다.
- Firebase Auth/Firestore는 쓰지 않는다.

Google 웹 클라이언트는 **앱과 같다.** 새로 만들지 마라.

```
109162230288-9644lmdagmid6oc5bqttoq2q9asnigji.apps.googleusercontent.com
```

Firebase 프로젝트: `dopa-66dfb`. 삭제된 `spot-4749d`는 쓰지 마라.

Worker `GOOGLE_CLIENT_IDS`에 이 웹 ID가 이미 들어 있다.
Worker `APPLE_CLIENT_IDS`는 production에서
`com.hyeongmin.dopa,ing.dopa.admin.web`을 허용한다.

---

## 2. 하면 안 되는 것

- Google Cloud에 **새** OAuth 클라이언트를 만들지 말 것. `aud`가 달라져 앱 계정과 어드민이 갈라진다.
- iOS/Android 클라이언트 ID를 Admin GIS에 넣지 말 것.
- Apple 웹 버튼에 iOS 번들 ID `com.hyeongmin.dopa`를 client ID로 넣지 말 것.
- Firebase Auth를 켜지 말 것.
- 시크릿을 git에 커밋하지 말 것. Google 웹 client ID는 공개 식별자라 커밋해도 된다.
- App Store / Play **프로덕션 심사**를 제출하지 말 것.
- TestFlight를 staging URL로 돌리지 말 것.
- 사용자 승인 없이 production Worker/Admin을 배포하지 말 것. 아래 3·4·5는 승인이 있으면 실행.

---

## 3. Google Cloud — 기존 웹 클라이언트 origin (완료)

2026-08-26 기존 클라이언트에 아래 **Authorized JavaScript origins** 저장을 확인했다.

1. https://console.cloud.google.com/ 로그인
2. 프로젝트 **`dopa-66dfb`** 선택
3. APIs & Services → Credentials
4. OAuth 2.0 Client IDs에서 타입이 **Web application**이고 ID가 아래인 항목을 연다  
   `109162230288-9644lmdagmid6oc5bqttoq2q9asnigji.apps.googleusercontent.com`
5. Authorized JavaScript origins에 추가하고 저장한다.

```
https://admin.dopa.ing
https://dopa-admin-staging.ceoofspot.workers.dev
http://localhost:3001
```

6. Authorized redirect URIs는 GIS popup이면 보통 필요 없다. 이미 있는 값을 지우지 말 것.
7. 클라이언트 ID 문자열을 바꾸지 말 것.

OAuth 앱은 2026-08-26 아래 브랜딩 URL을 저장하고 `프로덕션 단계`로 게시했다. `테스트 중`
상태에서는 테스트 사용자만 접근하므로 production Admin 로그인 완료 상태로 보지 않는다.

```
홈페이지: https://www.dopa.ing/
개인정보처리방침: https://www.dopa.ing/privacy/
서비스 약관: https://www.dopa.ing/terms/
```

게시 상태는 Google 로그인 화면 접근 범위일 뿐 Admin 권한 범위가 아니다. 백엔드는 기존 DOPA
사용자, `ADMIN` 역할과 업체 배정을 계속 검사한다.

확인: 브라우저에서 `https://admin.dopa.ing/login`을 열고 Google 버튼이 렌더되고, 클릭 시 origin 오류가 콘솔에 없어야 한다.  
`The given origin is not allowed` / `idpiframe_initialization_failed` 이면 origin이 빠진 것이다.

---

## 4. Apple — 같은 앱 아래 Services ID (완료)

앱 Apple 로그인은 번들 ID `com.hyeongmin.dopa`다. **웹 JS는 Services ID가 필요하다.**

Services ID `ing.dopa.admin.web`을 만들고 primary App ID `com.hyeongmin.dopa`에 연결했다.
등록된 production Website URLs는 다음 두 항목이다.

```
admin.dopa.ing
https://admin.dopa.ing/login
```

Apple authorization endpoint가 “DOPA Admin Web” 로그인 화면을 반환하는 것까지 확인했다.
staging을 Apple로 검증할 때는 HTTPS staging return URL을 별도로 등록한다. Apple 웹 return
URL은 HTTPS가 필수이므로 `http://localhost`를 production Services ID에 넣지 않는다.

만들 때:

1. https://developer.apple.com/account/resources/identifiers/list
2. Identifiers → `+` → **Services IDs**
3. Description: `DOPA Admin Web`
4. Identifier 권장값: `ing.dopa.admin.web`  
   (이미 쓰인 값이면 `ing.dopa.web` 등 같은 팀의 빈 역방향 도메인)
5. 이 Services ID를 연다 → Sign In with Apple → Enable → Configure
6. Primary App ID: **`com.hyeongmin.dopa`**
7. Domains: `admin.dopa.ing`
8. Production Return URL:

```
https://admin.dopa.ing/login
```

9. Worker `APPLE_CLIENT_IDS`에 **append** 한다. 기존 iOS 값을 지우지 말 것.

```
com.hyeongmin.dopa,ing.dopa.admin.web
```

staging은 `wrangler.jsonc`의 `env.staging.vars`, production은 Workers Secret으로 관리한다.

10. Admin에 공개 Services ID를 넣는다.

- `spot-admin/wrangler.production.jsonc` `vars.NEXT_PUBLIC_APPLE_CLIENT_ID`
- `spot-admin/wrangler.jsonc` `vars.NEXT_PUBLIC_APPLE_CLIENT_ID`
- `spot-admin/package.json`의 `cf:build` / `cf:build:production`에도 같은 값
- `spot-admin/scripts/deploy-cloudflare-staging.mjs` 빌드 env에도 같은 값

11. Admin을 다시 빌드·배포해야 버튼이 보인다. `NEXT_PUBLIC_*`는 빌드 타임이다.

Apple JS가 JWT `nonce`에 SHA-256을 넣으면 웹 Apple이 401일 수 있다. 그때는 실제 토큰의 `nonce` claim을 보고 Worker 비교를 맞춘다. Google은 nonce와 무관하다.

---

## 5. Production 배포 (2026-08-26 완료)

콘솔 origin(3)을 먼저 하는 편이 안전하다. 배포만 하고 origin이 없으면 Google 버튼이 깨진다.

### 5-1. API Worker (`oidc-login`이 여기 있다)

```bash
cd /Users/seohyeongmin/Desktop/github/spot-cloudflare-backend
git checkout main
git pull --ff-only origin main
pnpm verify
node scripts/deploy-production.mjs
curl -sS https://api.dopa.ing/health
```

`/health.release`가 배포한 SHA와 같아야 한다.

현재 API release는 `e6872e3c24eb78766e91dcc6bb54be3374c59935`, 코드 배포 version은
`146ca65c-6f64-4ac1-a740-77fb2d21b3c1`이다. `APPLE_CLIENT_IDS` 교체 뒤 최종 100% version은
`e34b0baa-426e-476f-bf91-f4721a9ec574`이고 `/health.release`는 계속 `e6872e3`과 일치한다.

### 5-2. Admin Web

```bash
cd /Users/seohyeongmin/Desktop/github/spot-admin
git checkout main
git pull --ff-only origin main
npm run verify
npm run cf:deploy:production
curl -sSI https://admin.dopa.ing/login
curl -sSI https://admin.dopa.ing/super-admin/dashboard
```

`/login`은 200, 비로그인 `/super-admin/dashboard`는 `/login`으로 307.

현재 Admin source는 `99ba954`, 100% Worker version은
`94de5fae-a818-43ab-b24f-c41d0fba5150`이다. 원격 `BUILD_ID`와 production 산출물의
`BUILD_ID`가 일치한다.

staging만 시험할 때:

```bash
npm run cf:deploy:staging:plan
DOPA_ADMIN_STAGING_DEPLOY_ACK=I_ACKNOWLEDGE_STAGING_ADMIN_DEPLOY \
  npm run cf:deploy:staging
```

---

## 6. 실계정 확인

전제: 슈퍼 어드민이 앱 Google 사용자를 업체에 **직접 배정**한 상태.

1. `https://admin.dopa.ing/login`
2. Google로 그 계정 로그인 → `/app` (업체 홈/파티)
3. 배정 안 된 일반 사용자 Google → 로그인 실패. “이 소셜 계정으로 어드민에 들어갈 수 없습니다” 또는 401
4. `@dopa.ing` 슈퍼 어드민은 기존 이메일/비밀번호로 들어간다
5. 초대 메일로 비밀번호를 만든 담당자는 폼 로그인이 된다
6. Apple Services ID를 켠 뒤에만 Apple 버튼이 보인다. 같은 Apple `sub`로 배정된 담당자가 `/app`으로 간다

---

## 7. 완료 조건

- [x] 기존 Google 웹 클라이언트에 production·staging·localhost origin이 있다. 새 클라이언트가 아니다.
- [x] Google OAuth 브랜딩 URL이 저장되고 게시 상태가 `프로덕션 단계`다.
- [x] production API `/health.release`가 `e6872e3`이다.
- [x] production Admin source가 `99ba954`, Worker가 `94de5fae`다.
- [ ] 배정된 앱 Google 계정으로 `admin.dopa.ing` 로그인 성공
- [ ] 미배정 계정은 실패
- [ ] 비밀번호 로그인 유지
- [x] Apple Services ID와 production URL이 등록되고 authorization 화면이 열린다.
- [ ] 배정된 Apple 계정의 ID token을 API에 보내 `/app` 진입

---

## 8. 관련 코드

| 역할             | 경로                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| OIDC API         | `spot-cloudflare-backend/apps/api-worker/src/routes/admin-auth.ts` `POST /oidc-login` |
| 공개 라우트 목록 | `spot-cloudflare-backend/scripts/check-route-guards.mjs`                              |
| Admin 로그인 UI  | `spot-admin/src/app/(auth)/login/page.tsx`                                            |
| Google GIS       | `spot-admin/src/auth/oidc/google-gis.tsx`                                             |
| Apple JS         | `spot-admin/src/auth/oidc/apple-signin.ts`                                            |
| 클라이언트 ID    | `spot-admin/src/auth/oidc/public-clients.ts`                                          |
| Admin 운영 정본  | `spot-admin/docs/OPERATIONS.md`                                                       |
