# TASK: GA4 퍼널 · 리텐션 코호트 · 추세 차트 · 필터 · 인사이트

Status: implemented and locally verified on 2026-09-08; not deployed
Branch: `feat/analytics-analysis` (base: `feat/super-admin-user-detail` head b746e69)

## Objective

`/super-admin/analytics`를 "GA4 표를 읽는 화면"에서 "질문에 답하는 화면"으로 바꾼다.
백엔드 엔드포인트를 추가하지 않고, 브라우저에서 GA Data API를 직접 호출하는 기존 구조와
세션 수명 액세스 토큰을 그대로 유지한다.

## Required implementation

1. `analytics-data-api.ts`에 메서드별 버전 라우팅(`runFunnelReport`는 `v1alpha`,
   나머지는 `v1beta`), `getMetadata` GET, 코호트·퍼널 요청 타입과 zod/mini 스키마,
   `assertFunnelContract`를 추가한다. 기간 두 개를 요청할 때만 GA4가 덧붙이는
   `dateRange` 측정기준을 계약이 허용한다.
2. 규칙을 순수 모듈로 분리한다: `analytics-report-shaping`, `analytics-format`,
   `analytics-filters`, `funnel-definitions`, `analytics-funnel`, `analytics-retention`,
   `analytics-insights`, `analytics-quota`. 각각 자체 테스트를 가진다.
3. `analytics-reports.ts`는 개요를 이전 기간 비교(일별 추세 + 플랫폼 분해 + 인사이트)로
   바꾸고, 필터를 모든 Core 요청에 전달하며, 퍼널·리텐션을 각 모듈에 위임한다.
   `fetchAnalyticsCapabilities`는 속성 메타데이터로 `account_type` 등록 여부를 확인한다.
4. UI: 의존성 없는 인라인 SVG 추세 차트(지연 로딩), 필터 바, 인사이트 요약, 퍼널 패널,
   리텐션 히트맵, 할당량 배너. 상태는 색만으로 전달하지 않는다.
5. 릴리스 계약: 대시보드는 차트 모듈을 정적으로 import하지 않는다. `recharts`는 계속 금지.

## Non-goals and prohibitions

- Dopa 백엔드, Worker, 다른 저장소는 건드리지 않는다. 새 Next.js route handler도 없다.
- 차트 라이브러리를 새로 추가하지 않는다(`scripts/test-production-hardening.mjs` 가드).
- `zod` 대신 `zod/mini`만 사용한다.
- Google 액세스 토큰의 저장 위치와 수명을 바꾸지 않는다.
- GA4가 값을 주지 않은 자리를 0으로 보정하지 않는다.

## Verification

- `npm run verify` (vitest + release contracts + runtime boundaries + eslint + OpenNext build)
- 실제 데이터 검증에는 GA4 맞춤 정의(`account_type`, 이벤트 범위 `route`/`method`/`result`)와
  주요 이벤트 지정이 선행되어야 한다. `docs/OPERATIONS.md`의 "퍼널 · 리텐션 · 추세 · 필터
  사전 설정"을 참고한다. 저장소 빌드 성공은 이 외부 설정 완료의 증거가 아니다.
