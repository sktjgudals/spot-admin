"use client";

import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { BusinessMobilePartyForm } from "@/components/business-mobile/BusinessMobilePartyForm";

export default function NewMyPartyPage() {
  return (
    <RoleGuard allow={["BUSINESS_ADMIN"]}>
      <Form />
    </RoleGuard>
  );
}

function Form() {
  const { admin } = useAdminAuth();
  if (!admin) return null;

  const scope = resolveBusinessScope({
    role: admin.role,
    profileBusinessId: admin.businessId,
  });
  if ("error" in scope) {
    return (
      <p className="text-sm text-destructive">businessId 없음</p>
    );
  }

  return <BusinessMobilePartyForm businessId={scope.businessId} />;
}
