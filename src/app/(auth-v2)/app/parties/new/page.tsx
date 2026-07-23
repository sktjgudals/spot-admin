"use client";

import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  myPartyDetailPath,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { PartyForm } from "../../_components/PartyForm";

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

  return (
    <PartyForm
      mode="create"
      businessId={scope.businessId}
      successHref={(id) => myPartyDetailPath(id)}
      cancelHref="/app/parties"
    />
  );
}
