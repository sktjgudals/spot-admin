"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import AdminSidebar, { MobileHeader } from "@/components/layout/AdminSidebar";
import { cn } from "@/lib/utils";

/** Shared SUPER_ADMIN chrome for /super-admin/* and /app/* operator screens. */
export function AdminDesktopChrome({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();
  const pathname = usePathname();
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
        <main
          className={cn(
            "flex-1 bg-slate-50 dark:bg-slate-950",
            pathname === "/super-admin/mail"
              ? "min-h-0 overflow-hidden p-0"
              : "p-4 sm:p-5 md:overflow-y-auto lg:p-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
