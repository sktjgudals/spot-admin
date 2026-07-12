"use client";

import * as Sentry from "@sentry/nextjs";
import { Geist } from "next/font/google";
import { useEffect } from "react";
import "./globals.css";
import { Button } from "@/components/ui/button";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    void fetch("/api/observability/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: error.message || "브라우저 오류",
        detail: error.stack,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="ko" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium tracking-wide text-muted-foreground">
                Dopa Admin
              </p>
              <p className="text-6xl font-bold tabular-nums text-slate-900">오류</p>
              <h1 className="text-xl font-semibold text-slate-900">
                문제가 발생했습니다
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {error.digest
                  ? `일시적인 오류입니다. 다시 시도해 주세요. (코드: ${error.digest})`
                  : "일시적인 오류입니다. 다시 시도해 주세요."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={() => reset()}>
                다시 시도
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                홈으로
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
