# Figma 업체 관리자 모바일 구현

- Figma file: `uPVCRXiIoV1zQIxQBRJtsy`
- 구현 기준일: 2026-08-09
- 대상: `BUSINESS_ADMIN`의 `/app/*`

## node 매핑

| Figma node | 구현 경로/상태 |
|---|---|
| `415:6721` | `/app/parties` 빈 상태 |
| `411:206` | `/app/parties` 파티 목록 |
| `413:4451` | `/app/parties/:partyId/applications` |
| `415:5329` | 신청 승인 성공 toast |
| `415:5532` | 신청 거절 bottom sheet |
| `415:5792` | 상태바 component-only node. 브라우저/PWA의 OS 영역이라 별도 화면 없음 |
| `415:5888` | 수동 체크인 확인 bottom sheet |
| `415:6106` | 체크인 성공 알림 |
| `415:6450` | `/app/parties/new` |
| `432:6708` | `/app/chat` 빈 상태 |
| `430:791` | `/app/chat` 목록 |
| `432:6389` | `/app/chat/:roomId` |
| `432:6633` | 채팅방 참여자 drawer |

## 계약 메모

- 화면 예시의 이름·숫자는 하드코딩하지 않는다. API에 없는 성별/출생연도/대기 수는 `-` 또는
  중립 표현으로 표시한다.
- 모바일 파티 생성은 backend 필수 계약 때문에 Figma에 생략된 `종료 날짜`와 `진행 장소`도
  받는다. 빈 값이나 임의 기본값으로 서버에 저장하지 않는다.
- 파티 유형은 화면 문구를 가짜 ID로 저장하지 않고 `/party-categories`의 활성 카테고리를
  조회해 실제 `categoryId`로 저장한다. 카테고리를 조회할 수 없으면 생성 버튼도 활성화하지 않는다.
- `BUSINESS_ADMIN` 기본 경로는 `/app/parties`다.
- 채팅방 drawer의 “채팅방 나가기”는 운영자 멤버십 삭제가 아니라 목록으로 이동하는 UI 동작이다.

## 남은 통합 경계

Admin Web은 Cloudflare Admin API의 세션과 운영자 경로만 사용한다. Firebase Auth/Firestore는
사용하지 않는다.

## 2026-08-09 릴리즈 게이트 검증

- Figma `411:206`을 다시 대조해 솔로파티 목록, 모집 상태 탭, 신청자 현황, QR 체크인,
  파티 만들기 구조를 확인했다. 화면의 업체명·파티명·인원은 예시가 아니라 API 값으로 그린다.
- Vitest 17개 파일, 51개 테스트가 통과했다.
- ESLint의 오류는 0건이다.
- Next.js production build가 36개 정적 페이지와 전체 동적 route를 생성했다.
- 빌드 시 Google Fonts를 다운로드하던 의존성을 제거하고 Figma 기준인 Pretendard 우선
  시스템 글꼴 스택을 사용한다. 네트워크 단절 때문에 배포 빌드가 실패하지 않는다.
- React effect 내부의 동기 상태 갱신을 제거해 인증 부트, 쿠폰 이력, 업체 선택 및 모바일
  breakpoint 구독이 React 19 릴리즈 게이트를 통과한다.

실제 staging 업체 계정 E2E는 Cloudflare staging API와 Admin Worker 조합으로 수행한다.
