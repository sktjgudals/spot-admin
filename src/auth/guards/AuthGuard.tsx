"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { SIGNED_OUT_LOGIN_PATH } from "@/auth/model/admin-routes";
import { Button } from "@/components/ui/button";

/**
 * Auth only — does not check SUPER_ADMIN vs BUSINESS_ADMIN.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status, bootError, retryBoot } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(SIGNED_OUT_LOGIN_PATH);
    }
  }, [status, router]);

  if (status === "booting") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="size-8 animate-spin rounded-full border-2 border-muted border-t-foreground"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">세션 확인 중…</p>
      </div>
    );
  }

  if (status === "degraded") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="max-w-sm text-center text-sm text-muted-foreground" role="alert">
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground" role="status">
          로그인 페이지로 이동 중…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
