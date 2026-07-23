"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";

/**
 * Auth only — does not check SUPER_ADMIN vs BUSINESS_ADMIN.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status, bootError, retryBoot } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "booting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
        <p className="text-sm text-muted-foreground">세션 확인 중…</p>
      </div>
    );
  }

  if (status === "degraded") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <p className="text-sm text-center text-muted-foreground max-w-sm">
          {bootError ?? "일시적인 오류가 발생했습니다."}
        </p>
        <Button type="button" onClick={() => void retryBoot()}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-muted-foreground">로그인 페이지로 이동 중…</p>
      </div>
    );
  }

  return <>{children}</>;
}
