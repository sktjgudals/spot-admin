"use client";

import type { ReactNode } from "react";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import AdminSidebar, { MobileHeader } from "@/components/layout/AdminSidebar";

/** Shared SUPER_ADMIN chrome for /super-admin/* and /app/* operator screens. */
export function AdminDesktopChrome({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();
  if (!admin) return null;

  const sidebarProps = {
    name: admin.name,
    email: admin.email,
  };

  return (
    <div className="flex flex-col md:flex-row md:h-screen">
      <AdminSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <MobileHeader {...sidebarProps} />
        <main className="flex-1 bg-slate-50 p-4 sm:p-5 md:overflow-y-auto lg:p-6 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
