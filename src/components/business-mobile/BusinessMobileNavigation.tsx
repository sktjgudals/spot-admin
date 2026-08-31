"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartPie,
  House,
  ListChecks,
  Mail,
  MessageSquare,
  UserRound,
} from "lucide-react";
import {
  BUSINESS_NAVIGATION_ITEMS,
  type BusinessNavigationIcon,
} from "@/components/business-mobile/business-navigation-model";
import { cn } from "@/lib/utils";

const NAVIGATION_ICONS = {
  home: House,
  insights: ChartPie,
  chat: MessageSquare,
  mail: Mail,
  reviews: ListChecks,
  profile: UserRound,
} satisfies Record<BusinessNavigationIcon, typeof House>;

export function BusinessLogoHeader() {
  return (
    <header className="flex h-14 items-center bg-background px-4 sm:px-6 lg:px-8">
      <Link
        href="/app/parties"
        className="inline-flex min-h-11 items-center rounded-lg text-lg font-bold leading-normal text-primary outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring"
        aria-label="Dopa 업체 관리자 홈"
      >
        Dopa
      </Link>
    </header>
  );
}

export function BusinessBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex min-h-16 w-full border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(0,0,0,0.04)] backdrop-blur supports-[backdrop-filter]:bg-background/90 md:bottom-auto md:top-0 md:h-16 md:max-w-none md:justify-center md:border-b md:border-t-0 md:pb-0 md:shadow-sm"
      aria-label="업체 관리자 메뉴"
    >
      {BUSINESS_NAVIGATION_ITEMS.map((item) => {
        const Icon = NAVIGATION_ICONS[item.icon];
        const active =
          item.href === "/app/parties"
            ? pathname === item.href
            : pathname === item.href ||
              (pathname?.startsWith(`${item.href}/`) ?? false);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[13px] leading-normal outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring md:my-2 md:max-w-32 md:flex-row md:gap-2 md:px-3",
              active
                ? "font-semibold text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className="size-[18px]"
              strokeWidth={active ? 2.2 : 1.7}
              aria-hidden
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
