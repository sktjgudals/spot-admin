"use client";

import { useEffect } from "react";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { captureClientException } from "@/lib/client-observability";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientException(error);
    void fetch("/api/observability/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: error.message || "브라우저 오류",
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-dvh items-center justify-center bg-background px-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="space-y-2">
              <p className="text-sm font-medium tracking-wide text-muted-foreground">
                Dopa Admin
              </p>
              <p className="tabular-data text-6xl font-semibold tracking-[-0.05em] text-foreground">
                오류
              </p>
              <h1 className="text-xl font-semibold text-foreground">
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
