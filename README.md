# DOPA 업체 어드민

솔로파티 업체가 파티 생성, 참가자 승인, 체크인, 운영 채팅과 정산을 관리하는 Next.js 16 어드민입니다. Figma 기반 `/app/*` 화면을 현재 릴리스 후보로 사용합니다.

## 현재 배포 구조

- 웹 런타임: Cloudflare Workers + OpenNext
- production: `https://admin.dopa.ing` (`dopa-admin` Worker)
- production API/WebSocket: `https://api.dopa.ing` / `wss://api.dopa.ing/v2/chat`
- staging Worker: `dopa-admin-staging`
- staging API: `https://dopa-backend-staging.ceoofspot.workers.dev`
- staging WebSocket: `wss://dopa-backend-staging.ceoofspot.workers.dev/v2/chat`
- 데이터 정본: Cloudflare D1 및 Durable Objects
- Firebase 용도: 모바일 푸시와 분석만 사용

`wrangler.jsonc`는 staging, `wrangler.production.jsonc`는 production을 담당합니다. production 명령은 항상 `api.dopa.ing`으로 OpenNext를 새로 빌드한 뒤 `admin.dopa.ing`에 배포합니다.

## 로컬 실행

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

## 검증

```bash
npm run test
npm run test:release
npm run lint
npm run cf:build

# 한 번에 실행
npm run verify
```

`npm run check:cloudflare-only`는 활성 코드와 배포 설정에서 삭제된 인프라, 퇴역한 채팅 호스트, 잘못된 제품 분류 표현, production 라우트를 차단합니다.

## Cloudflare staging

```bash
# 실제 변경 없이 대상 확인
npm run cf:deploy:staging:plan

# 로컬 workerd 미리보기
npm run cf:preview

# 명시적 승인 문자열이 있을 때만 staging 배포
DOPA_ADMIN_STAGING_DEPLOY_ACK=I_ACKNOWLEDGE_STAGING_ADMIN_DEPLOY \
  npm run cf:deploy:staging
```

GitHub Actions 배포에는 staging environment의 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` secret이 필요합니다. 자동 운영 배포는 없습니다.

## Cloudflare production

```bash
npm run cf:deploy:production
```

이 명령은 production 환경변수로 빌드부터 다시 실행하므로 staging `.open-next` 산출물을 운영에 재사용하지 않습니다.

## 남은 인증 전환

새 `/app/*` 어드민 화면은 production Cloudflare API를 사용합니다. 기존 `/super-admin`, `/business` 경로는 전환 호환을 위해 남아 있으므로 신규 운영은 `/app/*`를 기준으로 합니다.

관련 설계와 검증 기록은 [docs/CLOUDFLARE_DEPLOY.md](docs/CLOUDFLARE_DEPLOY.md), [docs/FIGMA_BUSINESS_MOBILE_IMPLEMENTATION.md](docs/FIGMA_BUSINESS_MOBILE_IMPLEMENTATION.md)를 참고하세요.
