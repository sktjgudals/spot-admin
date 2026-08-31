"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BUSINESS_NAVIGATION_ITEMS } from "@/components/business-mobile/business-navigation-model";
import { cn } from "@/lib/utils";

export function BusinessMobileChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasPrimaryNavigation = BUSINESS_NAVIGATION_ITEMS.some(
    (item) => item.href === pathname,
  );

  return (
    <div className="min-h-dvh bg-muted/40 text-foreground">
      <div
        className={cn(
          "relative mx-auto min-h-dvh w-full bg-background md:max-w-[1440px] md:border-x md:shadow-sm",
          hasPrimaryNavigation && "md:pt-16",
        )}
      >
        {children}
      </div>
    </div>
  );
}
