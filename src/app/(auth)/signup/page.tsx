"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { homePathForRole } from "@/auth/model/admin-auth.types";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import {
  completeBootstrap,
  fetchBootstrapStatus,
  requestBootstrapCode,
  verifyBootstrapCode,
} from "@/auth/api/admin-bootstrap.api";
import { EmailCodeWizard, type EmailCodeWizardConfig } from "@/components/auth/EmailCodeWizard";

const emailSchema = z.object({
  email: z
    .string()
    .email("올바른 이메일을 입력하세요")
    .refine((v) => v.trim().toLowerCase().endsWith("@dopa.ing"), {
      message: "내부 도메인(@dopa.ing) 이메일만 사용할 수 있습니다",
    }),
});

function mapBootstrapError(err: unknown): string {
  if (!(err instanceof AdminAuthError)) {
    return "요청에 실패했습니다. 잠시 후 다시 시도하세요.";
  }
  const code = err.message || err.code;
  switch (code) {
    case "BOOTSTRAP_ALREADY_COMPLETED":
      return "서버 업데이트가 필요합니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.";
    case "INTERNAL_EMAIL_DOMAIN_REQUIRED":
      return "@dopa.ing 이메일만 사용할 수 있습니다.";
    case "ADMIN_ACCOUNT_EXISTS":
      return "이미 등록된 어드민 이메일입니다.";
    case "INVALID_OR_EXPIRED_CODE":
      return "인증 코드가 올바르지 않거나 만료되었습니다.";
    case "CODE_ATTEMPTS_EXCEEDED":
      return "인증 시도 횟수를 초과했습니다. 코드를 다시 요청하세요.";
    case "INVALID_OR_EXPIRED_SETUP_TOKEN":
      return "설정 세션이 만료되었습니다. 이메일 인증부터 다시 진행하세요.";
    case "PASSWORD_TOO_WEAK":
      return "비밀번호는 10자 이상이어야 합니다.";
    case "NAME_REQUIRED":
      return "이름을 입력하세요.";
    default:
      return err.message || "요청에 실패했습니다.";
  }
}

/**
 * SUPER_ADMIN 회원가입 (Cloudflare Admin API bootstrap 3-step).
 * @dopa.ing 직원은 여러 명 가입 가능. 업체 계정은 초대 링크(/invite/…)로만 가입.
 */
export default function SuperAdminSignupPage() {
  const router = useRouter();
  const { status, acceptIssuedSession, admin, homePath } = useAdminAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

  useEffect(() => {
    if (status === "booting" || status === "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchBootstrapStatus();
        if (cancelled) return;
        if (s.open === false) {
          toast.error("현재 슈퍼 어드민 공개 가입이 비활성화되어 있습니다.");
        }
        setReady(true);
      } catch {
        if (cancelled) return;
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "booting" || !ready) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">확인 중…</p>
      </div>
    );
  }

  if (status === "authenticated") {
    return <div className="text-sm text-muted-foreground py-12">이동 중…</div>;
  }

  const config: EmailCodeWizardConfig = {
    copy: {
      email: {
        title: "슈퍼 어드민 가입",
        description: "Dopa 직원(@dopa.ing) · 이메일 인증 후 비밀번호 설정",
      },
      code: {
        title: "인증 코드 입력",
        description: "메일로 받은 6자리 코드를 입력하세요.",
      },
      password: {
        title: "계정 만들기",
        description: "이름과 비밀번호를 설정하면 바로 로그인됩니다.",
      },
      done: { title: "", description: "" },
    },
    emailSchema,
    includeName: true,
    emailPlaceholder: "you@dopa.ing",
    labels: {
      sendCode: "인증 코드 받기",
      verifyCode: "코드 확인",
      complete: "슈퍼 어드민 계정 만들기",
      completing: "가입 중…",
    },
    requestCode: requestBootstrapCode,
    verifyCode: verifyBootstrapCode,
    complete: async ({ setupToken, password, name }) => {
      const completed = await completeBootstrap({
        setupToken,
        password,
        name: name?.trim() ?? "",
      });
      const role = acceptIssuedSession(completed);
      router.replace(homePathForRole(role));
    },
    mapError: mapBootstrapError,
    requestSuccess: (devCode) =>
      devCode ? `개발용 코드: ${devCode}` : "인증 코드를 이메일로 보냈습니다",
    verifySuccess: "이메일 인증이 완료되었습니다",
    completeSuccess: "슈퍼 어드민 계정이 생성되었습니다",
    footer: (
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        업체 담당자는 초대 메일 <code className="rounded bg-muted px-1">/invite/…</code> 로
        가입합니다.{" "}
        <Link href="/login" className="text-primary underline-offset-2 hover:underline">
          로그인
        </Link>
      </p>
    ),
  };

  return <EmailCodeWizard config={config} />;
}
