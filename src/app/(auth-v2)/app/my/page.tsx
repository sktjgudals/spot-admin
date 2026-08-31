"use client";

import { useState } from "react";
import { Building2, LogOut, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileNavigation";

export default function BusinessMyPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <MyPage />
    </RoleGuard>
  );
}
function MyPage() {
  const { admin, logout } = useAdminAuth();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
      window.location.assign("/login");
    } catch {
      setLoading(false);
      toast.error("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <div className="min-h-dvh bg-muted/20 pb-24 font-pretendard md:pb-8">
      <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header>
          <p className="text-xs font-medium text-primary">계정 및 업체 정보</p>
          <h1 className="mt-1 text-2xl font-bold">마이페이지</h1>
        </header>
        <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
          <section className="rounded-2xl border bg-card p-5 text-card-foreground">
            <div className="flex items-center gap-3">
              <div className="grid size-14 place-items-center rounded-full border bg-muted text-muted-foreground">
                <UserRound className="size-8" fill="currentColor" strokeWidth={1.2} aria-hidden />
              </div>
              <div className="min-w-0">
                <strong className="block truncate text-lg">{admin?.name ?? "관리자"}</strong>
                <span className="block truncate text-sm text-muted-foreground">{admin?.business?.name ?? "업체 관리자"}</span>
              </div>
            </div>
            <dl className="mt-5 divide-y rounded-xl border">
              <InfoRow icon={Building2} label="업체" value={admin?.business?.name ?? "-"} />
              <InfoRow icon={Mail} label="이메일" value={admin?.email ?? "-"} />
            </dl>
          </section>
          <section className="rounded-2xl border bg-card p-5 text-card-foreground">
            <h2 className="font-semibold">세션</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">공용 기기에서는 작업을 마친 뒤 반드시 로그아웃해 주세요.</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleLogout()}
              className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
            >
              <LogOut className="size-4" aria-hidden />
              {loading ? "로그아웃 중…" : "로그아웃"}
            </button>
          </section>
        </div>
      </main>
      <BusinessBottomNav />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <dt className="w-14 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-sm">{value}</dd>
    </div>
  );
}
