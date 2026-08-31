"use client";

import { useState, type ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BellRing,
  Building2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Flag,
  ImageIcon,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Settings,
  ShieldAlert,
  Star,
  Tags,
  TicketPercent,
  Undo2,
  UserCog,
} from "lucide-react";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { clearSessionAndRedirect } from "@/lib/auth-session";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const navGroups: ReadonlyArray<{ label: string; items: readonly NavItem[] }> = [
  {
    label: "개요",
    items: [
      { href: "/super-admin/dashboard", label: "대시보드", icon: LayoutDashboard },
      { href: "/super-admin/analytics", label: "제품 분석", icon: BarChart3 },
      { href: "/super-admin/mail", label: "메일", icon: Mail },
    ],
  },
  {
    label: "운영 큐",
    items: [
      { href: "/super-admin/reports", label: "신고 처리", icon: ShieldAlert },
      { href: "/super-admin/inquiries", label: "문의", icon: MessageSquareText },
      { href: "/super-admin/refund-policy-requests", label: "환불 정책", icon: Undo2 },
      { href: "/super-admin/business-role-requests", label: "업체 권한 신청", icon: ClipboardCheck },
    ],
  },
  {
    label: "고객과 업체",
    items: [
      { href: "/super-admin/users", label: "사용자", icon: UserCog },
      { href: "/app/businesses", label: "업체 · 파티 · 초대", icon: Building2 },
      { href: "/super-admin/business-admins", label: "업체 관리자 배정", icon: ClipboardCheck },
      { href: "/super-admin/payments", label: "결제 · 환불", icon: CreditCard },
    ],
  },
  {
    label: "성장과 콘텐츠",
    items: [
      { href: "/super-admin/coupons", label: "쿠폰", icon: TicketPercent },
      { href: "/super-admin/notifications", label: "알림 캠페인", icon: BellRing },
      { href: "/super-admin/banners", label: "배너", icon: ImageIcon },
      { href: "/super-admin/categories", label: "파티 카테고리", icon: Tags },
      { href: "/super-admin/review-tags", label: "리뷰 태그", icon: Star },
    ],
  },
  {
    label: "시스템",
    items: [
      { href: "/super-admin/report-reasons", label: "신고 사유", icon: Flag },
      { href: "/super-admin/config", label: "런타임 설정", icon: Settings },
    ],
  },
] as const;

const allNavItems = navGroups.flatMap((group) => group.items);

export function adminRouteLabel(pathname: string): string {
  return (
    allNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      ?.label ?? "운영 콘솔"
  );
}

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = { name: string; email: string };
type InnerProps = Props & { onClose?: () => void };

function SidebarInner({ name, email, onClose }: InnerProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { logout } = useAdminAuth();

  const handleLogout = () => {
    void (async () => {
      try {
        await logout();
      } finally {
        await clearSessionAndRedirect({ queryClient });
      }
    })();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-sidebar-border bg-white shadow-xs">
          <Image src="/dopa-logo.png" alt="" width={30} height={30} priority />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">Dopa Admin</p>
            <Badge variant="outline" className="h-5 rounded px-1.5 text-xs tracking-wide">
              OPS
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">Platform operations</p>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label="슈퍼 관리자 메뉴">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && "mt-5")}>
            <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                    className={cn(
                      "group relative flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-2 left-0 w-0.5 rounded-r bg-transparent",
                        active && "bg-sidebar-primary",
                      )}
                      aria-hidden
                    />
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {active ? <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar className="size-8 shrink-0 border border-sidebar-border">
            <AvatarFallback className="text-xs font-semibold">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <LogOut aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSidebar(props: Props) {
  return (
    <aside className="hidden h-dvh w-(--shell-sidebar-width) shrink-0 border-r border-sidebar-border md:block">
      <SidebarInner {...props} />
    </aside>
  );
}

export function MobileHeader(props: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-(--shell-header-height) shrink-0 items-center border-b bg-background/92 px-3 backdrop-blur-xl md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="size-5" aria-hidden />
          <span className="sr-only">메뉴 열기</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(88vw,19rem)] gap-0 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">슈퍼 관리자 메뉴</SheetTitle>
          <SidebarInner {...props} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="ml-2 min-w-0 flex-1">
        <p className="data-kicker">Dopa Admin</p>
        <p className="truncate text-sm font-semibold leading-4">{adminRouteLabel(pathname)}</p>
      </div>
      <ThemeToggle compact />
    </header>
  );
}
