# 작업 명세: 알림 발송 이력 · 읽음 통계 · 예약 발송 (어드민 UI 파트)

> 선행: `../spot-backend/docs/NOTIFICATION_CAMPAIGN_BRIEF.md`의 백엔드 파트(NotificationCampaign 스키마 + scheduledAt + process-due)가 먼저 완료·배포되어야 함.
> DB 규칙: 스키마는 spot-backend가 소스. 이 저장소엔 모델 미러링만 (`db push` 금지 — .cursor/rules/project.mdc 참고).

## 1. 스키마 미러링

spot-backend에 추가된 `NotificationCampaign` 모델 + `CampaignStatus` enum + `NotificationHistory.campaignId`를
이 저장소 `prisma/schema.prisma`에 그대로 복사 → `npx prisma generate`.

## 2. 알림 페이지 개편 (`src/app/(super-admin)/super-admin/notifications/`)

현재: TestSendCard + NotificationForm(즉시 발송). 추가할 것:

### 2-1. 예약 발송 (NotificationForm)

- "발송 시점" 선택: 즉시 / 예약 (라디오 또는 Select)
- 예약 선택 시 `<Input type="datetime-local">` (KST, 현재+10분 이후만 허용)
- `POST /api/super-admin/notifications` body에 `scheduledAt` (ISO string) 추가
- API 라우트(`src/app/api/super-admin/notifications/route.ts`)에서 scheduledAt 검증(미래 시각) 후 백엔드로 전달
- 응답의 `scheduled: true`면 "예약 완료" 토스트

### 2-2. 발송 이력 리스트 (신규 섹션 or 탭)

서버 컴포넌트에서 직접 Prisma 조회 (파티/유저 페이지 패턴):

```ts
const campaigns = await prisma.notificationCampaign.findMany({
  orderBy: { createdAt: "desc" },
  take: 50,
  include: { _count: { select: { histories: true } } },
});
// 읽음 수는 groupBy 한 번으로:
const readCounts = await prisma.notificationHistory.groupBy({
  by: ["campaignId"],
  where: { campaignId: { not: null }, status: "READ" },
  _count: true,
});
```

테이블 컬럼: 제목 · 대상(targetType 라벨 + targetCount) · 분류 · 상태 배지(예약됨/발송됨/취소됨) · 예약/발송 시각 · **수신 n명 / 읽음 m명 (m/n%)**
- 수신 n = histories count (필터 제외자는 히스토리가 없음)
- SCHEDULED 상태엔 "예약 취소" 버튼 → `DELETE /api/super-admin/notifications/[campaignId]` (새 라우트 → 백엔드 `DELETE /internal/notifications/campaigns/:id` 프록시)

### 2-3. 캠페인 상세 (Dialog 또는 `/notifications/[campaignId]` 페이지)

누가 읽었는지 개별 표시:

```ts
const histories = await prisma.notificationHistory.findMany({
  where: { campaignId },
  include: { user: { select: { nickname: true, email: true } } },
  orderBy: { updatedAt: "desc" },
});
```

행: 닉네임 · 이메일 · 상태(SENT=미읽음 / READ=읽음 / FAILED) · 읽은 시각(updatedAt, READ일 때)

## 3. 완료 기준

- [ ] `./node_modules/.bin/tsc --noEmit` + `npm run build` 통과
- [ ] 즉시 발송 → 이력 리스트에 SENT로 표시, 앱에서 알림함 열면 읽음 수 증가 확인
- [ ] 예약 발송 → SCHEDULED 표시 → (Cloud Scheduler 5분 주기) 시각 도달 후 SENT 전환 확인
- [ ] 예약 취소 동작 확인
- [ ] 배포: .cursor/rules/project.mdc의 gcloud 명령 (이미지 태그 v4+)
