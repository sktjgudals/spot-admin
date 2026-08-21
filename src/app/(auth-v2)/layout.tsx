"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/auth/guards/AuthGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { BusinessMobileChrome } from "@/components/business-mobile/BusinessMobileChrome";
import { AdminDesktopChrome } from "@/components/layout/AdminDesktopChrome";

/** Cloudflare Admin API shell — HttpOnly session cookies + memory access token. */
export default function AuthV2AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AuthV2Chrome>{children}</AuthV2Chrome>
    </AuthGuard>
  );
}

function AuthV2Chrome({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();

  if (admin?.role === "BUSINESS_ADMIN") {
    return <BusinessMobileChrome>{children}</BusinessMobileChrome>;
  }

  return <AdminDesktopChrome>{children}</AdminDesktopChrome>;
}
