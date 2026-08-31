"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/auth/guards/AuthGuard";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { createRetryableLazyComponent } from "@/components/performance/RetryableLazyComponent";

type RoleChromeProps = { children: ReactNode };

const roleChromeLazyOptions = {
  loading: <AuthenticatedShellFallback />,
  errorTitle: "관리자 화면을 불러오지 못했습니다.",
  errorDescription: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  retryLabel: "화면 다시 불러오기",
};

const BusinessMobileChrome = createRetryableLazyComponent<RoleChromeProps>(
  () =>
    import("@/components/business-mobile/BusinessMobileChrome").then(
      (module) => ({ default: module.BusinessMobileChrome }),
    ),
  roleChromeLazyOptions,
);

const AdminDesktopChrome = createRetryableLazyComponent<RoleChromeProps>(
  () =>
    import("@/components/layout/AdminDesktopChrome").then(
      (module) => ({ default: module.AdminDesktopChrome }),
    ),
  roleChromeLazyOptions,
);

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

  if (!admin) return null;

  if (admin?.role === "BUSINESS_ADMIN") {
    return <BusinessMobileChrome>{children}</BusinessMobileChrome>;
  }

  return <AdminDesktopChrome>{children}</AdminDesktopChrome>;
}

export function AuthenticatedShellFallback() {
  return (
    <div
      className="min-h-dvh bg-background"
      role="status"
      aria-label="관리자 화면 준비 중"
      aria-busy="true"
    >
      <div className="h-16 border-b bg-card" />
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_1fr] lg:px-8">
        <div className="hidden h-[calc(100dvh-7rem)] animate-pulse rounded-2xl border bg-muted/50 lg:block" />
        <div className="space-y-4">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-44 animate-pulse rounded-2xl border bg-card" />
          <div className="h-64 animate-pulse rounded-2xl border bg-card" />
        </div>
      </div>
    </div>
  );
}
