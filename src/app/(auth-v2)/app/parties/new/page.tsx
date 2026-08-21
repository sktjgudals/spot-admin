"use client";

import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { BusinessMobilePartyForm } from "@/components/business-mobile/BusinessMobilePartyForm";

export default function NewMyPartyPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
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

  return (
    <BusinessMobilePartyForm
      mode="create"
      businessId={scope.businessId}
      successHref={(id) => `/app/parties/${encodeURIComponent(id)}`}
      cancelHref="/app/parties"
    />
  );
}
