"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { homePathForRole } from "@/auth/model/admin-routes";

/**
 * Root — Auth v2 session restore / role home. No NextAuth.
 */
export default function HomePage() {
  const { status, admin, homePath, bootError, retryBoot } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    } else if (status === "unauthenticated") {
      router.replace("/login");
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
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
      <p className="text-sm text-muted-foreground">세션 확인 중…</p>
    </div>
  );
}
