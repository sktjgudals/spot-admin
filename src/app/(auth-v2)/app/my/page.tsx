"use client";

import { useState } from "react";
import { Building2, LogOut, Mail, UserRound } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileChrome";

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
    await logout();
    window.location.assign("/login");
  }

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-20">
      <header className="flex h-14 items-center px-4">
        <h1 className="text-[18px] font-bold">마이페이지</h1>
      </header>
      <section className="flex items-center gap-3 px-4 py-5">
        <div className="grid size-[58px] place-items-center rounded-full border border-[#dedede] bg-[#f5f5f5] text-[#b8b8b8]">
          <UserRound className="size-8" fill="currentColor" strokeWidth={1.2} />
        </div>
        <div className="min-w-0">
          <strong className="block truncate text-[18px]">{admin?.name ?? "관리자"}</strong>
          <span className="block truncate text-[14px] text-[#686868]">{admin?.business?.name ?? "업체 관리자"}</span>
        </div>
      </section>
      <dl className="mx-4 divide-y divide-[#f5f5f5] rounded-xl border border-[#dedede]">
        <InfoRow icon={Building2} label="업체" value={admin?.business?.name ?? "-"} />
        <InfoRow icon={Mail} label="이메일" value={admin?.email ?? "-"} />
      </dl>
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleLogout()}
        className="mx-4 mt-8 flex h-12 w-[calc(100%-32px)] items-center justify-center gap-2 rounded-xl border border-[#dedede] text-[14px] text-[#686868] disabled:opacity-50"
      >
        <LogOut className="size-4" />
        {loading ? "로그아웃 중…" : "로그아웃"}
      </button>
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
    <div className="flex items-center gap-3 px-4 py-4">
      <Icon className="size-4 text-[#8f8f8f]" />
      <dt className="w-14 text-[14px] text-[#8f8f8f]">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-[14px]">{value}</dd>
    </div>
  );
}
