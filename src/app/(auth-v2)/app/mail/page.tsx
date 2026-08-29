import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileChrome";
import { MailConsole } from "@/components/mail/MailConsole";

export default function BusinessAdminMailPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <MailConsole compact />
      <BusinessBottomNav />
    </RoleGuard>
  );
}
