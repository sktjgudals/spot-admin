"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  homePathForRole,
  SIGNED_OUT_LOGIN_PATH,
} from "@/auth/model/admin-routes";

/**
 * Root — restore the Cloudflare Admin API session and open the role home.
 */
export default function HomePage() {
  const { status, admin, homePath, bootError, retryBoot } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    } else if (status === "unauthenticated") {
      router.replace(SIGNED_OUT_LOGIN_PATH);
    }
  }, [status, admin, homePath, router]);

  if (status === "degraded") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-muted-foreground text-center">
          {bootError ?? "일시적 오류"}
        </p>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => void retryBoot()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">세션 확인 중…</p>
    </div>
  );
}
