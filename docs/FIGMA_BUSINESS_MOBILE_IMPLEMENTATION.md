# Figma 업체 관리자 모바일 구현

- Figma file: `uPVCRXiIoV1zQIxQBRJtsy`
- 구현 기준일: 2026-08-09
- 대상: Auth v2 `BUSINESS_ADMIN`의 `/app/*`

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
- `BUSINESS_ADMIN` 기본 경로는 폐기된 `/business/dashboard`가 아니라 `/app/parties`다.
- 채팅방 drawer의 “채팅방 나가기”는 운영자 멤버십 삭제가 아니라 목록으로 이동하는 UI 동작이다.

## 남은 통합 경계

Admin Web의 Auth v2 토큰은 현재 Nest admin audience이고, Cloudflare의
`/chat/operator/*`, `/parties/*` 운영자 경로는 Cloudflare user/operator audience를 요구한다.
화면에서 해당 정식 경로를 호출하도록 구현했지만, 실 staging E2E 전에는 admin→operator
단기 토큰 교환을 Cloudflare 쪽에 옮겨야 한다. Firebase Auth/Firestore는 사용하지 않는다.
