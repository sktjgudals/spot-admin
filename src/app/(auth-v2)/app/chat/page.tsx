import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BusinessMobileChatList } from "@/components/business-mobile/BusinessMobileChatList";

export default function BusinessChatPage() {
  return (
    <RoleGuard allow={["BUSINESS_ADMIN"]}>
      <BusinessMobileChatList />
    </RoleGuard>
  );
}
