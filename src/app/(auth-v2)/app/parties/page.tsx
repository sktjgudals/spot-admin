"use client";

import Link from "next/link";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { ALL_ADMIN_ROLES } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  myPartyDetailPath,
  resolveBusinessScope,
  ROUTE_BUSINESSES,
} from "@/auth/model/admin-routes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createRetryableLazyComponent } from "@/components/performance/RetryableLazyComponent";
import type { BusinessPartyListPanelProps } from "../_components/BusinessPartyListPanel";

const BusinessPartyListPanel =
  createRetryableLazyComponent<BusinessPartyListPanelProps>(
    () =>
      import("../_components/BusinessPartyListPanel").then((module) => ({
        default: module.BusinessPartyListPanel,
      })),
    {
      loading: (
        <div
          className="grid min-h-72 place-items-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground"
          role="status"
          aria-busy="true"
        >
          업체 파티 화면을 준비하는 중…
        </div>
      ),
      errorTitle: "업체 파티 화면을 불러오지 못했습니다.",
    },
  );

/**
 * BUSINESS_ADMIN home parties — businessId from /me only.
 * SUPER_ADMIN is guided to pick a business (no implicit tenant).
 */
export default function AppPartiesPage() {
  return (
    <RoleGuard allow={ALL_ADMIN_ROLES}>
      <MyPartiesShell />
    </RoleGuard>
  );
}

function MyPartiesShell() {
  const { admin } = useAdminAuth();
  if (!admin) return null;

  if (admin.role === "SUPER_ADMIN") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>파티 (SUPER_ADMIN)</CardTitle>
          <CardDescription>
            테넌트 스코프가 필요합니다. 업체를 선택한 뒤 파티로 이동하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Link href={ROUTE_BUSINESSES} className="text-primary underline">
            → /app/businesses
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            <code>/app/businesses/:businessId/parties</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  const scope = resolveBusinessScope({
    role: admin.role,
    profileBusinessId: admin.businessId,
    routeBusinessId: null,
  });

  if ("error" in scope) {
    return (
      <p className="text-sm text-destructive">
        계정에 businessId가 없습니다. 초대를 확인하세요.
      </p>
    );
  }

  return (
    <BusinessPartyListPanel
      businessId={scope.businessId}
      partyHref={(id) => myPartyDetailPath(id)}
      createHref="/app/parties/new"
    />
  );
}
