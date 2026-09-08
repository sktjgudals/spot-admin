# 배너 이미지 업로드 — 설계 (spot-admin)

**날짜:** 2026-09-08 · **상태:** 승인됨(제품 오너) · **짝 PR:** spot-cloudflare-backend `feat/admin-media-upload-url` (`POST /admin/v2/media/upload-url`)

## 문제
`/super-admin/banners`의 "배너 추가" 다이얼로그는 `이미지 URL*`에 이미 호스팅된 절대 URL을 요구한다. 운영자는 로컬 이미지 파일만 갖고 있고 어드민에 SUPER_ADMIN용 업로드가 없어서 홈 메인 배너(앱 홈 상단 16:9 캐러셀 = 이 제품의 유일한 배너)를 추가할 수 없다. 함께 발견된 결함: 수정 다이얼로그의 액션 옵션이 4종뿐이라 INSTAGRAM/YOUTUBE/PHONE/EMAIL 배너를 열면 select가 빈 값으로 강등된다; 서버가 지원하는 노출 기간(`startsAt`/`endsAt`)이 폼에 없다; `datetime` 필드는 수정 시 ISO 문자열이 그대로 들어가 `datetime-local` 입력이 비어 보인다.

## 결정
1. 제네릭 리소스 콘솔의 `Field.type`에 `"image"` 추가 + `upload: { url, hint?, preview?: "square" | "wide" }`. `ResourceEditorDialog`가 image 필드를 기존 `PartyImageUploader`(단일 모드) + "URL 직접 입력" `<input type="url">`(같은 값에 바인딩)로 렌더한다. 업로더는 `hint`·`preview` prop을 얻고, 기존 업체 파티 폼 사용처는 기본값으로 무변경.
2. `bannersConfig`: `imageUrl`을 image 필드로(`/admin/v2/media/upload-url`, wide 미리보기, "jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)"), `startsAt`/`endsAt` datetime 필드를 create/edit에 노출, 액션 옵션 8종을 create/edit 공용 상수로.
3. `initialValues`가 datetime 필드를 `datetime-local` 포맷(로컬 시간 `YYYY-MM-DDTHH:mm`)으로 변환; `normalizeValues`는 수정 모드에서 비운 datetime 필드를 `null`로 보내 일정 해제를 허용(서버 patch 스키마는 nullish 허용).
4. CSP `connect-src`에 R2 S3 엔드포인트 `https://8c676e7121f390b03c3af9a59a9445ca.r2.cloudflarestorage.com` 추가(`security-headers.ts` + `public/_headers` 미러). 워커 티켓 경로일 땐 `api.dopa.ing`이라 이미 허용.
5. 목록 `이미지` 컬럼은 URL 텍스트 대신 작은 썸네일(`<img>` 높이 40px, title=URL).
6. 런타임 경계(BFF·Prisma 금지) 유지 — 업로드 티켓은 `adminFetchJson`으로 워커에, 바이트는 브라우저→R2 직접 PUT.

## 범위 밖
배너 삭제 시 R2 객체 삭제, 다중 배너 슬롯/placement, 이미지 크롭 UI.

## 검증
`npm run verify` (vitest + release 스크립트 + 런타임 경계 + eslint + OpenNext 빌드). 수동: `next dev` + 스테이징 워커에서 파일 드롭 → publicUrl → 저장 → 목록 썸네일.
