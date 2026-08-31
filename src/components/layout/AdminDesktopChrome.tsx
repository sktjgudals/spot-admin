"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import AdminSidebar, { adminRouteLabel, MobileHeader } from "@/components/layout/AdminSidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
    <div className="flex min-h-dvh flex-col bg-background md:h-dvh md:flex-row md:overflow-hidden">
      <a
        href="#admin-main"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background shadow-lg transition-transform focus:translate-y-0"
      >
        본문으로 건너뛰기
      </a>
      <AdminSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <MobileHeader {...sidebarProps} />
        <header className="hidden h-(--shell-header-height) shrink-0 items-center justify-between border-b bg-background/90 px-5 backdrop-blur-xl md:flex">
          <div className="min-w-0">
            <p className="data-kicker">Platform operations</p>
            <p className="truncate text-sm font-semibold leading-4">
              {adminRouteLabel(pathname)}
            </p>
          </div>
          <ThemeToggle compact />
        </header>
        <main
          id="admin-main"
          tabIndex={-1}
          className={cn(
            "flex-1 bg-background outline-none",
            pathname === "/super-admin/mail"
              ? "min-h-0 overflow-hidden p-0"
              : "p-4 sm:p-5 md:overflow-y-auto md:p-6 xl:p-8",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
