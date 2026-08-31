"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod/mini";
import { Loader2 } from "lucide-react";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { homePathForRole } from "@/auth/model/admin-auth.types";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import {
  completePasswordReset,
  requestPasswordReset,
  verifyPasswordResetCode,
} from "@/auth/api/admin-password-reset.api";
import { EmailCodeWizard, type EmailCodeWizardConfig } from "@/components/auth/EmailCodeWizard";

const emailSchema = z.object({
  email: z.email("올바른 이메일을 입력하세요"),
});

function mapResetError(err: unknown): string {
  if (!(err instanceof AdminAuthError)) {
    return "요청에 실패했습니다. 잠시 후 다시 시도하세요.";
  }
  const code = err.code || err.message;
  switch (code) {
    case "INVALID_OR_EXPIRED_CODE":
      return "인증 코드가 올바르지 않거나 만료되었습니다.";
    case "INVALID_OR_EXPIRED_SETUP_TOKEN":
      return "설정 세션이 만료되었습니다. 처음부터 다시 진행하세요.";
    case "PASSWORD_TOO_WEAK":
      return "비밀번호는 10자 이상이어야 합니다.";
    case "NETWORK_ERROR":
      return "네트워크 오류입니다. 연결을 확인해 주세요.";
    case "ThrottlerException":
    case "Too Many Requests":
      return "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
    default:
      if (err.message === "INVALID_OR_EXPIRED_CODE") {
        return "인증 코드가 올바르지 않거나 만료되었습니다.";
      }
      if (err.message === "INVALID_OR_EXPIRED_SETUP_TOKEN") {
        return "설정 세션이 만료되었습니다. 처음부터 다시 진행하세요.";
      }
      if (err.message === "PASSWORD_TOO_WEAK") {
        return "비밀번호는 10자 이상이어야 합니다.";
      }
      return err.message || "요청에 실패했습니다.";
  }
}

/**
 * 비밀번호 초기화 — Cloudflare Admin API 3-step (request → verify → complete).
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { status, admin, homePath } = useAdminAuth();

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

  if (status === "booting") {
    return (
      <div className="flex flex-col items-center gap-3 py-16" role="status" aria-live="polite">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">세션 확인 중…</p>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <p className="py-12 text-sm text-muted-foreground" role="status">
        이동 중…
      </p>
    );
  }

  const config: EmailCodeWizardConfig = {
    copy: {
      email: {
        title: "비밀번호 초기화",
        description: "가입한 이메일 주소로 인증 코드가 전송됩니다.",
      },
      code: {
        title: "인증 코드 입력",
        description: "메일로 받은 6자리 코드를 입력하세요. 약 15분간 유효합니다.",
      },
      password: {
        title: "새 비밀번호 설정",
        description: "변경 후 다른 기기 세션은 모두 로그아웃됩니다.",
      },
      done: {
        title: "비밀번호 변경 완료",
        description: "새 비밀번호로 로그인할 수 있습니다.",
      },
    },
    emailSchema,
    showDone: true,
    labels: {
      sendCode: "인증 코드 전송",
      verifyCode: "코드 확인",
      complete: "비밀번호 변경",
      completing: "변경 중…",
    },
    requestCode: requestPasswordReset,
    verifyCode: verifyPasswordResetCode,
    complete: async ({ setupToken, password }) => {
      await completePasswordReset({ setupToken, password });
    },
    mapError: mapResetError,
    requestSuccess: (devCode) =>
      devCode ? `개발용 코드: ${devCode}` : "계정이 있으면 인증 코드를 보냈습니다",
    verifySuccess: "인증이 완료되었습니다. 새 비밀번호를 설정하세요.",
    completeSuccess: "비밀번호가 변경되었습니다",
    doneHref: "/login",
    doneLabel: "로그인하러 가기",
  };

  return <EmailCodeWizard config={config} />;
}
