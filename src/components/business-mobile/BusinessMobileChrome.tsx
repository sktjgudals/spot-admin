"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, House, ListChecks, MessageSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app/parties", label: "홈", icon: House },
  { href: "/app/chat", label: "채팅", icon: MessageSquare },
  { href: "/app/reviews", label: "리뷰 관리", icon: ListChecks },
  { href: "/app/my", label: "마이페이지", icon: UserRound },
] as const;

export function BusinessMobileChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f5f5f5] text-[#2d2d2d]">
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-white shadow-[0_0_32px_rgba(45,45,45,0.08)]">
        {children}
      </div>
    </div>
  );
}
export function BusinessLogoHeader() {
  return (
    <header className="flex h-14 items-center justify-between bg-white px-4">
      <Link
        href="/app/parties"
        className="text-[18px] font-bold leading-[1.5] text-[#9c6cf2]"
        aria-label="Dopa 업체 관리자 홈"
      >
        Dopa
      </Link>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-xl text-[#2d2d2d] transition-colors hover:bg-[#f5f5f5]"
        aria-label="알림"
      >
        <Bell className="size-5" strokeWidth={1.8} />
      </button>
    </header>
  );
}

export function BusinessBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[64px] w-full max-w-[430px] border-t border-[#f0f0f0] bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="업체 관리자 메뉴"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/app/parties"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[13px] leading-[1.5] transition-colors",
              active ? "font-semibold text-[#9c6cf2]" : "text-[#8f8f8f]",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.7} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
