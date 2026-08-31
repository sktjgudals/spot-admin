import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileNavigation";
import { MailConsole } from "@/components/mail/MailConsole";

export default function BusinessAdminMailPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <div className="h-[calc(100dvh-4rem)] min-h-0 overflow-hidden">
        <MailConsole compact responsiveCompact />
      </div>
      <BusinessBottomNav />
    </RoleGuard>
  );
}
