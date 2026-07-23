"use client";

import { useParams } from "next/navigation";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  businessPartiesPath,
  businessPartyDetailPath,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";
import { PartyForm } from "../../../../_components/PartyForm";

export default function NewPartySuperAdminPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <Form />
    </RoleGuard>
  );
}

function Form() {
  const params = useParams();
  const { admin } = useAdminAuth();
  const routeBusinessId = String(params.businessId ?? "");
  if (!admin) return null;

  const scope = resolveBusinessScope({
    role: admin.role,
    profileBusinessId: admin.businessId,
    routeBusinessId,
  });
  if ("error" in scope) {
    return <p className="text-sm text-destructive">scope 오류</p>;
  }

  return (
    <PartyForm
      mode="create"
      businessId={scope.businessId}
      successHref={(id) => businessPartyDetailPath(scope.businessId, id)}
      cancelHref={businessPartiesPath(scope.businessId)}
    />
  );
}
