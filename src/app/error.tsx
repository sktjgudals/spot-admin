"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { StatusPage } from "@/components/error/StatusPage";

export default function ErrorPage({
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
        title: error.message || "어드민 오류",
        detail: error.stack,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <StatusPage
      code="오류"
      title="문제가 발생했습니다"
      description={
        error.digest
          ? `일시적인 오류입니다. 다시 시도해 주세요.\n(코드: ${error.digest})`
          : "일시적인 오류입니다. 다시 시도하거나 홈으로 돌아가 주세요."
      }
      primaryLabel="다시 시도"
      onPrimaryClick={reset}
      secondaryHref="/"
      secondaryLabel="홈으로"
    />
  );
}
