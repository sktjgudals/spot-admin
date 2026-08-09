# Cloudflare staging 배포

## 목적

업체 어드민의 새 `/app/*` 화면을 삭제된 서버 인프라와 분리하고, `dopa-backend-staging`에만 연결된 OpenNext Worker로 검증합니다.

## 안전 경계

- 허용 Worker: `dopa-admin-staging`
- 허용 API/WS: `dopa-backend-staging.ceoofspot.workers.dev`
- production environment, route, custom domain은 설정하지 않음
- 실제 배포는 정확한 `DOPA_ADMIN_STAGING_DEPLOY_ACK` 값이 있어야 실행
- secret은 Wrangler 또는 GitHub staging environment에서만 주입

## 명령

```bash
npm run verify
npm run cf:deploy:staging:plan
DOPA_ADMIN_STAGING_DEPLOY_ACK=I_ACKNOWLEDGE_STAGING_ADMIN_DEPLOY \
  npm run cf:deploy:staging
```

배포 스크립트는 활성 파일의 Cloudflare-only 검사, OpenNext 빌드, staging Worker 배포 순으로 실행합니다. 실패하면 다음 단계로 진행하지 않습니다.

## 로그와 롤백

Worker 로그는 Cloudflare Workers Observability에서 확인합니다. 배포 후 문제가 발견되면 Cloudflare Deployments에서 이전 `dopa-admin-staging` 버전으로 롤백합니다. production 전환은 별도 승인과 인증 E2E가 끝난 뒤 새 설정으로 추가합니다.
