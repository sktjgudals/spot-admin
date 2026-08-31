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
      <p className="mx-auto my-8 max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive" role="alert">
        업체 연결 정보를 찾을 수 없습니다. 초대 상태를 확인해 주세요.
      </p>
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
