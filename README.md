# DOPA Admin

DOPA의 슈퍼어드민과 업체 운영자가 사용하는 Next.js 16 관리 웹입니다. 인증·데이터·채팅은
모두 `spot-cloudflare-backend`를 사용하며, 이 Worker는 Prisma나 D1에 직접 접근하지 않습니다.

## 현재 배포 구조

- 웹 런타임: Cloudflare Workers + OpenNext
- production: `https://admin.dopa.ing` (`dopa-admin` Worker)
- production API/WebSocket: `https://api.dopa.ing` / `wss://api.dopa.ing/v2/chat`
- staging Worker: `dopa-admin-staging`
- staging API: `https://dopa-backend-staging.ceoofspot.workers.dev`
- staging WebSocket: `wss://dopa-backend-staging.ceoofspot.workers.dev/v2/chat`
- 데이터 정본: Cloudflare D1 및 Durable Objects
- 관리자 전역 조회: `DB_ADMIN_00` read model + `dopa-admin-projection` Queue
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

`npm run test:release`와 `npm run check:admin-runtime`은 Prisma, `DATABASE_URL`, 직접 DB 접근,
레거시 `/api/super-admin/*` BFF 호출의 재유입을 차단합니다.

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

## 현재 기능

- 가입 완료 응답의 세션을 즉시 적용하고 인증 확정 뒤 역할별 홈으로 이동
- 슈퍼어드민 대시보드, 사용자, 업체, 파티, 초대, 권한 신청, 환불 정책, 결제·환불
- 쿠폰, 문의, 알림 캠페인, 배너, 파티 카테고리, 리뷰 태그, 런타임 설정
- 업체 파티 생성·수정, 참가 신청 승인·거절, 체크인, 채팅, 리뷰 관리
- 업체별 파티 템플릿 저장·불러오기 및 `businessId` 소유권 검증
- 카드 단위 로딩·빈 결과·403·재시도 가능한 서버 오류 처리

라우트, 인증, 배포, 롤백과 E2E 기준은 [운영 정본](docs/OPERATIONS.md)을 참고하세요.
