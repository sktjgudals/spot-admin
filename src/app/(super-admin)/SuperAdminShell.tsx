"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/auth/guards/AuthGuard";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { SUPER_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { AdminDesktopChrome } from "@/components/layout/AdminDesktopChrome";

/** SUPER_ADMIN chrome guarded by the Cloudflare Admin API session. */
export default function SuperAdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard allow={SUPER_ADMIN_ONLY}>
        <AdminDesktopChrome>{children}</AdminDesktopChrome>
      </RoleGuard>
    </AuthGuard>
  );
}
