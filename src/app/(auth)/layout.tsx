"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focused = pathname?.startsWith("/reset-password") ?? false;

  if (focused) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
        <div className="flex w-full max-w-md flex-col items-center">{children}</div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background p-3 sm:p-5 lg:grid lg:place-items-center lg:p-8">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-hidden border bg-surface shadow-(--elevation-2) sm:min-h-[calc(100dvh-2.5rem)] sm:rounded-2xl lg:min-h-[min(48rem,calc(100dvh-4rem))] lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]">
        <aside className="relative hidden overflow-hidden bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white">
              <Image src="/dopa-logo.png" width={34} height={34} alt="" priority />
            </span>
            <div>
              <p className="text-sm font-semibold">Dopa Admin</p>
              <p className="text-xs text-background/60">Platform operations</p>
            </div>
          </div>

          <div className="max-w-sm">
            <p className="data-kicker data-kicker-on-contrast">
              One operating system
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              운영은 더 선명하게.
            </h2>
            <p className="mt-5 text-sm leading-7 text-background/65">
              고객, 업체, 파티와 결제 흐름을 한곳에서 확인하고 필요한 작업에 바로
              집중하세요.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-background/15 pt-5 text-xs text-background/60">
            <span>역할 기반 권한</span>
            <span>추적 가능한 작업</span>
            <span>안전한 세션</span>
          </div>
        </aside>

        <section className="grid min-h-full place-items-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="flex min-h-[43rem] w-full max-w-md flex-col items-center justify-center">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
