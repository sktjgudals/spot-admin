/**
 * GA4 이벤트 이름의 한국어 라벨.
 *
 * 이 목록은 Dopa 앱이 실제로 보내는 이름과 GA4가 자동 수집하는 이름만 담는다.
 * 존재하지 않는 이벤트에 라벨을 달아두면, 운영자는 "구매"라는 줄이 안 보이는
 * 이유를 앱이 아니라 이 화면에서 찾게 된다. 모르는 이름은 원문 그대로 둔다.
 */
export const EVENT_LABELS: Record<string, string> = {
  screen_view: "화면 조회",
  page_view: "페이지 조회",
  api_mutation: "데이터 변경",
  login_started: "로그인 시작",
  login_completed: "로그인 완료",
  login_canceled: "로그인 취소",
  login_failed: "로그인 실패",
  logout_started: "로그아웃 시작",
  logout_completed: "로그아웃 완료",
  signup_completed: "가입 완료",
  banner_click: "배너 클릭",
  app_cta_click: "앱 설치 유도 클릭",
  notification_opened: "알림 열기",
  notification_permission: "알림 권한",
  loading_stalled: "로딩 지연",
  chat_generation_mismatch: "채팅 세션 불일치",
  chat_realtime_recovered: "채팅 실시간 복구",
  withdraw_started: "탈퇴 시작",
  withdraw_completed: "탈퇴 완료",
  first_open: "첫 실행",
  first_visit: "첫 방문",
  session_start: "세션 시작",
  user_engagement: "참여",
  app_remove: "앱 삭제",
  os_update: "OS 업데이트",
  app_update: "앱 업데이트",
};
