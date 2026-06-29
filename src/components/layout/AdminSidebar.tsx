"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Building2,
  PartyPopper,
  FileText,
  LogOut,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { AdminRole } from "@/generated/prisma";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const superAdminNav: NavItem[] = [
  { href: "/super-admin/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/super-admin/users", label: "유저 관리", icon: Users },
  { href: "/super-admin/businesses", label: "업체 관리", icon: Building2 },
  { href: "/super-admin/parties", label: "파티 관리", icon: PartyPopper },
];

const businessNav: NavItem[] = [
  { href: "/business/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/business/parties", label: "파티 관리", icon: PartyPopper },
  { href: "/business/applications", label: "신청 관리", icon: FileText },
  { href: "/business/settlements", label: "정산", icon: BarChart3 },
];

interface Props {
  role: AdminRole;
  name: string;
  email: string;
  businessName?: string;
}

export default function AdminSidebar({ role, name, email, businessName }: Props) {
  const pathname = usePathname();
  const navItems = role === "SUPER_ADMIN" ? superAdminNav : businessNav;

  return (
    <aside className="flex flex-col w-60 border-r bg-background h-screen sticky top-0">
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">S</span>
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">Dopa Admin</p>
            {businessName && (
              <p className="text-xs text-muted-foreground mt-0.5">{businessName}</p>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
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

      <Separator />
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <Avatar className="w-7 h-7">
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
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="w-4 h-4 mr-2" />
          로그아웃
        </Button>
      </div>
    </aside>
  );
}
