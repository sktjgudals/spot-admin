"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import {
  BellRing,
  Building2,
  ClipboardCheck,
  CreditCard,
  ImageIcon,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  Menu,
  MessageSquareText,
  Settings,
  Star,
  Tags,
  TicketPercent,
  UserCog,
  Undo2,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { clearSessionAndRedirect } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: "/super-admin/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/super-admin/users", label: "사용자", icon: UserCog },
  { href: "/app/businesses", label: "업체 · 파티 · 초대", icon: Building2 },
  { href: "/super-admin/business-role-requests", label: "업체 권한 신청", icon: ClipboardCheck },
  { href: "/super-admin/refund-policy-requests", label: "환불 정책", icon: Undo2 },
  { href: "/super-admin/coupons", label: "쿠폰", icon: TicketPercent },
  { href: "/super-admin/inquiries", label: "문의", icon: MessageSquareText },
  { href: "/super-admin/payments", label: "결제 · 환불", icon: CreditCard },
  { href: "/super-admin/notifications", label: "알림", icon: BellRing },
  { href: "/super-admin/banners", label: "배너", icon: ImageIcon },
  { href: "/super-admin/categories", label: "파티 카테고리", icon: Tags },
  { href: "/super-admin/review-tags", label: "리뷰 태그", icon: Star },
  { href: "/super-admin/config", label: "런타임 설정", icon: Settings },
];

interface Props {
  name: string;
  email: string;
}

interface InnerProps extends Props {
  onClose?: () => void;
}

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* 로고 */}
      <div className="px-4 py-5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
            <Image src="/dopa-logo.png" alt="Dopa" width={32} height={32} className="object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-none">Dopa Admin</p>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* 유저 정보 */}
      <Separator className="shrink-0" />
      <div className="px-3 py-3 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarFallback className="text-xs">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name}</p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive px-3"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          로그아웃
        </Button>
      </div>
    </div>
  );
}

/* 데스크톱 사이드바 (md 이상) */
export default function AdminSidebar(props: Props) {
  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-background h-screen sticky top-0 shrink-0">
      <SidebarInner {...props} />
    </aside>
  );
}

/* 모바일/태블릿 헤더 (md 미만) */
export function MobileHeader(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center h-14 border-b bg-background/95 backdrop-blur supports-backdrop-filter:backdrop-blur-sm px-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className={cn(
            "inline-flex items-center justify-center rounded-md w-9 h-9",
            "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors -ml-1"
          )}
        >
          <Menu className="w-5 h-5" />
          <span className="sr-only">메뉴 열기</span>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 gap-0" showCloseButton={false}>
          <SidebarInner {...props} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="ml-3 flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-md overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
          <Image src="/dopa-logo.png" alt="Dopa" width={24} height={24} className="object-contain" />
        </div>
        <span className="font-semibold text-sm shrink-0">Dopa Admin</span>
      </div>
    </header>
  );
}
