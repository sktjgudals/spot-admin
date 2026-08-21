import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { BusinessMobileChatList } from "@/components/business-mobile/BusinessMobileChatList";

export default function BusinessChatPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <BusinessMobileChatList />
    </RoleGuard>
  );
}
