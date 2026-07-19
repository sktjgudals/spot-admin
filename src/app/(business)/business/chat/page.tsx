import ChatRoomList from "./ChatRoomList";

/** 업체 채팅 문의함 — 유저 ↔ 업체 DM. 목록/대화는 클라이언트에서 폴링으로 갱신. */
export default function BusinessChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">채팅 문의</h1>
        <p className="text-sm text-muted-foreground">
          유저가 보낸 문의에 업체 이름으로 답장합니다. 답장은 앱에 실시간
          전달되고, 미접속 유저에게는 푸시가 발송됩니다.
        </p>
      </div>
      <ChatRoomList />
    </div>
  );
}
