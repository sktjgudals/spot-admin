"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/auth/guards/AuthGuard";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import AdminSidebar, { MobileHeader } from "@/components/layout/AdminSidebar";

export default function BusinessShell({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard allow={["BUSINESS_ADMIN"]}>
        <BusinessChrome>{children}</BusinessChrome>
      </RoleGuard>
    </AuthGuard>
  );
}

function BusinessChrome({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();
  if (!admin) return null;

  const sidebarProps = {
    role: "BUSINESS" as const,
    name: admin.name,
    email: admin.email,
    businessName: admin.business?.name,
    businessLogoUrl: null as string | null,
  };

  return (
    <div className="flex flex-col md:flex-row md:h-screen">
      <AdminSidebar {...sidebarProps} />
      <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden">
        <MobileHeader {...sidebarProps} />
        <main className="flex-1 md:overflow-y-auto p-4 sm:p-5 lg:p-6 bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
