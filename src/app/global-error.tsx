"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    // Slack([admin (client)]) 알림 — 실패는 무시.
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
    <html lang="ko">
      <body>
        <h2>문제가 발생했습니다</h2>
        <button type="button" onClick={() => reset()}>
          다시 시도
        </button>
      </body>
    </html>
  );
}
