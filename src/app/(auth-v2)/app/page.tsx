"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { homePathForRole } from "@/auth/model/admin-auth.types";

/** Role-based home after Auth v2 session restore / login. */
export default function AuthV2AppHomePage() {
  const { admin, status } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePathForRole(admin.role));
    }
  }, [status, admin, router]);

  return (
    <div className="text-sm text-muted-foreground">홈으로 이동 중…</div>
  );
}
