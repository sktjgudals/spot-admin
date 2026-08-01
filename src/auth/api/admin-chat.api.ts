import { adminFetchJson } from "@/auth/api/admin-http";

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

export function adminChatGatewayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CHAT_WS_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") return "ws://localhost:8080/v2/chat";
  throw new Error("NEXT_PUBLIC_CHAT_WS_URL is not configured");
}
