"use client";

import { useParams } from "next/navigation";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { BusinessMobileChatRoom } from "@/components/business-mobile/BusinessMobileChatRoom";

export default function BusinessChatRoomPage() {
  const roomId = String(useParams().roomId ?? "");
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <BusinessMobileChatRoom roomId={roomId} />
    </RoleGuard>
  );
}
