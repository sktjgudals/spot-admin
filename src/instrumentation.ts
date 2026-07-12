import * as Sentry from "@sentry/nextjs";
import { notifySlackError } from "@/lib/slack";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * 서버(요청 처리) 오류를 Sentry로 캡처하고 Slack([admin])으로도 알린다.
 * 유저 관리 상세 등 서버 컴포넌트에서 나는 오류가 여기로 들어온다.
 */
export const onRequestError: typeof Sentry.captureRequestError = (
  error,
  request,
  context,
) => {
  Sentry.captureRequestError(error, request, context);

  const err = error as { message?: string; stack?: string } | undefined;
  void notifySlackError({
    source: "admin",
    title: err?.message?.slice(0, 200) || "서버 오류",
    detail: err?.stack,
    fields: {
      path: request?.path,
      method: request?.method,
    },
  });
};
