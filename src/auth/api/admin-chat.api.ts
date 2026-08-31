import { adminFetchJson } from "@/auth/api/admin-http";

export type BusinessOperatorRoom = {
  id: string;
  businessId?: string;
  userId: string | null;
  userNickname: string | null;
  userProfileImage: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  assignedAdminUserId?: string | null;
  isMuted?: boolean;
  isBusinessUserBlocked?: boolean;
};

export type BusinessOperatorRoomDetail = {
  id: string;
  type: "BIZ_DM";
  title: string;
  imageUrl: string | null;
  otherUserId: string;
  unreadCount: number;
  isMuted: boolean;
  isBusinessUserBlocked: boolean;
};

export type BusinessOperatorMessage = {
  id: string;
  roomSeq: number;
  roomId: string;
  senderType: "USER" | "BUSINESS" | "SYSTEM";
  senderId: string | null;
  senderNickname: string | null;
  senderProfileImage: string | null;
  senderIsBusinessAdmin: boolean;
  body: string;
  type: "TEXT" | "IMAGE" | "VIDEO";
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  clientMessageId: string | null;
  createdAt: string;
  deliveryState: "committed" | "pending" | "accepted" | "failed";
  isDeleted?: boolean;
};

export type AdminChatGatewayTicket = {
  accessToken: string;
  expiresAt: string;
  operatorUserId: string;
  businessId: string;
};

export function issueAdminChatGatewayTicket(roomId: string) {
  return adminFetchJson<AdminChatGatewayTicket>(
    `/admin/v2/chat/rooms/${encodeURIComponent(roomId)}/gateway-ticket`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function listBusinessOperatorRooms() {
  return adminFetchJson<BusinessOperatorRoom[]>("/chat/operator/rooms");
}

export function getBusinessOperatorRoom(roomId: string) {
  return adminFetchJson<BusinessOperatorRoomDetail>(
    `/chat/operator/rooms/${encodeURIComponent(roomId)}`,
  );
}

export type BusinessOperatorMessageListOptions = {
  afterSeq?: number;
  beforeSeq?: number;
  limit?: number;
};

export function listBusinessOperatorMessages(
  roomId: string,
  options: BusinessOperatorMessageListOptions | number = {},
) {
  const normalized = typeof options === "number" ? { afterSeq: options } : options;
  const limit = Math.min(100, Math.max(1, normalized.limit ?? 100));
  const query = new URLSearchParams({ limit: String(limit) });
  if (normalized.afterSeq !== undefined) query.set("afterSeq", String(normalized.afterSeq));
  if (normalized.beforeSeq !== undefined) query.set("beforeSeq", String(normalized.beforeSeq));
  return adminFetchJson<{ messages: BusinessOperatorMessage[]; hasMore: boolean }>(
    `/chat/operator/rooms/${encodeURIComponent(roomId)}/messages?${query.toString()}`,
  );
}

export function markBusinessOperatorRoomRead(roomId: string, roomSeq: number) {
  return adminFetchJson<{ ok: boolean; businessLastReadSeq: number }>(
    `/chat/operator/rooms/${encodeURIComponent(roomId)}/read`,
    { method: "POST", body: JSON.stringify({ roomSeq }) },
  );
}

export const businessChatQueryKeys = {
  rooms: ["business-operator", "chat-rooms"] as const,
  room: (roomId: string) => ["business-operator", "chat-room", roomId] as const,
  messages: (roomId: string) => ["business-operator", "chat-messages", roomId] as const,
};

export function adminChatGatewayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CHAT_WS_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") return "ws://localhost:8080/v2/chat";
  throw new Error("NEXT_PUBLIC_CHAT_WS_URL is not configured");
}
