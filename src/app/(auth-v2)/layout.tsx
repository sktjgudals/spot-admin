"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/auth/guards/AuthGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BusinessMobileChrome } from "@/components/business-mobile/BusinessMobileChrome";

/**
 * Auth v2 shell layout — Nest cookies + memory access token.
 * Does not use NextAuth. NextAuth layouts remain until full cutover.
 */
export default function AuthV2AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AuthV2Chrome>{children}</AuthV2Chrome>
    </AuthGuard>
  );
}

function AuthV2Chrome({ children }: { children: ReactNode }) {
  const { admin, logout } = useAdminAuth();

  if (admin?.role === "BUSINESS_ADMIN") {
    return <BusinessMobileChrome>{children}</BusinessMobileChrome>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/app" className="font-semibold text-sm shrink-0">
            Dopa Admin
          </Link>
          <span className="text-xs text-muted-foreground truncate">
            Auth v2 · {admin?.role}
            {admin?.businessId ? ` · ${admin.businessId.slice(0, 8)}…` : ""}
          </span>
          <Link href="/app/parties" className="text-xs text-primary">
            파티
          </Link>
          {admin?.role === "SUPER_ADMIN" && (
            <Link href="/app/business-user-reviews" className="text-xs text-primary">
              업체 유저리뷰 관리
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[180px]">
            {admin?.email}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void logout().then(() => {
              window.location.assign("/login");
            })}
          >
            로그아웃
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
