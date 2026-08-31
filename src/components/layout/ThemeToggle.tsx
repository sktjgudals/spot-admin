"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const ready = resolvedTheme !== undefined;
  const dark = resolvedTheme === "dark";
  const label = dark ? "라이트 모드" : "다크 모드";

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "sm"}
      aria-label={label}
      title={label}
      className={compact ? undefined : "w-full justify-start text-muted-foreground"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      disabled={!ready}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </Button>
  );
}
