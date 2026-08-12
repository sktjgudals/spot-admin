# Cloudflare 배포

## 구조

- production Worker: `dopa-admin`
- production custom domain: `admin.dopa.ing`
- production API/WS: `https://api.dopa.ing` / `wss://api.dopa.ing/v2/chat`
- staging Worker: `dopa-admin-staging`
- staging API/WS: `dopa-backend-staging.ceoofspot.workers.dev`
- secret은 Wrangler 또는 GitHub environment에서만 주입

## Staging

```bash
npm run verify
npm run cf:deploy:staging:plan
DOPA_ADMIN_STAGING_DEPLOY_ACK=I_ACKNOWLEDGE_STAGING_ADMIN_DEPLOY \
  npm run cf:deploy:staging
```

staging 스크립트는 Cloudflare-only 검사, OpenNext 빌드, `dopa-admin-staging` 배포 순서로 실행합니다.

## Production

```bash
npm run cf:deploy:production
```

production 명령은 `api.dopa.ing`을 대상으로 OpenNext를 새로 빌드한 다음 `wrangler.production.jsonc`로 `dopa-admin`을 배포합니다. 기존 staging `.open-next` 산출물을 운영에 재사용하지 않습니다.

## 검증과 롤백

- `https://admin.dopa.ing/login`, `/icon.png`, `/dopa-logo.png` HTTP 200 확인
- `api.dopa.ing` admin CORS preflight 204 확인
- Cloudflare Workers Observability에서 서버 오류 확인
- 문제 발견 시 Cloudflare Deployments에서 직전 정상 버전으로 롤백
