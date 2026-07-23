"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  homePathForRole,
  type AdminWebRole,
} from "@/auth/model/admin-auth.types";

/**
 * Role check only — nest inside AuthGuard.
 * Actual API authorization remains on Nest Guards.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: AdminWebRole[];
  children: ReactNode;
}) {
  const { status, admin } = useAdminAuth();
  const router = useRouter();

  const allowed = admin != null && allow.includes(admin.role);

  useEffect(() => {
    if (status !== "authenticated" || !admin) return;
    if (!allow.includes(admin.role)) {
      router.replace(homePathForRole(admin.role));
    }
  }, [status, admin, allow, router]);

  if (status !== "authenticated" || !admin) {
    return null;
  }

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        이 페이지에 접근할 권한이 없습니다. 이동 중…
      </div>
    );
  }

  return <>{children}</>;
}
