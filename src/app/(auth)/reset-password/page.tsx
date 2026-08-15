"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { homePathForRole } from "@/auth/model/admin-auth.types";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import {
  completePasswordReset,
  requestPasswordReset,
  verifyPasswordResetCode,
} from "@/auth/api/admin-password-reset.api";

type Step = "email" | "code" | "password" | "done";

const emailSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
});

const codeSchema = z.object({
  code: z
    .string()
    .min(6, "인증 코드 6자리를 입력하세요")
    .max(6, "인증 코드 6자리를 입력하세요")
    .regex(/^\d{6}$/, "숫자 6자리 코드를 입력하세요"),
});

const passwordSchema = z
  .object({
    password: z.string().min(10, "비밀번호는 10자 이상이어야 합니다"),
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["passwordConfirm"],
  });

type EmailValues = z.infer<typeof emailSchema>;
type CodeValues = z.infer<typeof codeSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

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

const STEP_COPY: Record<
  Step,
  { title: string; description: string }
> = {
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
};

/**
 * 비밀번호 초기화 — Cloudflare Admin API 3-step (request → verify → complete).
 * UI: Majormap 스타일 클린 화이트 + 로고/제목/필드/풀폭 CTA.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { status, admin, homePath } = useAdminAuth();
  const formId = useId();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiresHint, setExpiresHint] = useState<string | null>(null);

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

  if (status === "booting") {
    return (
      <div
        className="flex flex-col items-center gap-3 py-16"
        role="status"
        aria-live="polite"
      >
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

  const onEmail = async (data: EmailValues) => {
    setBusy(true);
    try {
      const res = await requestPasswordReset(data.email.trim());
      const normalized = data.email.trim().toLowerCase();
      setEmail(normalized);
      setDevCode(res.devCode ?? null);
      setExpiresHint(
        res.expiresAt
          ? `코드 유효 시간: ${new Date(res.expiresAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}까지`
          : null,
      );
      codeForm.reset({ code: "" });
      setStep("code");
      toast.success(
        res.devCode
          ? `개발용 코드: ${res.devCode}`
          : "계정이 있으면 인증 코드를 보냈습니다",
      );
    } catch (err) {
      toast.error(mapResetError(err));
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (data: CodeValues) => {
    setBusy(true);
    try {
      const res = await verifyPasswordResetCode({
        email,
        code: data.code.trim(),
      });
      setSetupToken(res.setupToken);
      passwordForm.reset({ password: "", passwordConfirm: "" });
      setStep("password");
      toast.success("인증이 완료되었습니다. 새 비밀번호를 설정하세요.");
    } catch (err) {
      toast.error(mapResetError(err));
    } finally {
      setBusy(false);
    }
  };

  const onPassword = async (data: PasswordValues) => {
    setBusy(true);
    try {
      await completePasswordReset({
        setupToken,
        password: data.password,
      });
      setStep("done");
      toast.success("비밀번호가 변경되었습니다");
    } catch (err) {
      toast.error(mapResetError(err));
      if (
        err instanceof AdminAuthError &&
        (err.code === "INVALID_OR_EXPIRED_SETUP_TOKEN" ||
          err.message === "INVALID_OR_EXPIRED_SETUP_TOKEN")
      ) {
        setSetupToken("");
        setStep("email");
      }
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!email || busy) return;
    setBusy(true);
    try {
      const res = await requestPasswordReset(email);
      setDevCode(res.devCode ?? null);
      toast.success(
        res.devCode
          ? `개발용 코드: ${res.devCode}`
          : "코드를 다시 보냈습니다",
      );
    } catch (err) {
      toast.error(mapResetError(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = STEP_COPY[step];

  return (
    <div className="w-full max-w-sm space-y-8">
      {/* Brand + title — Majormap-like clean header */}
      <div className="flex flex-col items-center space-y-4 text-center">
        <div className="flex items-center gap-2">
          <Image
            src="/dopa-logo.png"
            alt="Dopa"
            width={36}
            height={36}
            className="object-contain"
            priority
          />
          <span className="text-base font-semibold tracking-wide text-slate-800">
            DOPA
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
            {copy.title}
          </h1>
          <p className="text-sm leading-relaxed text-slate-500">
            {copy.description}
          </p>
        </div>
      </div>

      {/* Step: email */}
      {step === "email" && (
        <form
          id={`${formId}-email`}
          onSubmit={emailForm.handleSubmit(onEmail)}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`${formId}-email-input`} className="text-slate-700">
              이메일 <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-email-input`}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              placeholder="이메일을 입력해주세요."
              className="h-11"
              aria-invalid={!!emailForm.formState.errors.email}
              aria-describedby={
                emailForm.formState.errors.email
                  ? `${formId}-email-err`
                  : undefined
              }
              {...emailForm.register("email")}
            />
            {emailForm.formState.errors.email && (
              <p
                id={`${formId}-email-err`}
                className="text-xs text-destructive"
                role="alert"
              >
                {emailForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 w-full text-sm font-semibold"
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                전송 중…
              </>
            ) : (
              "인증 코드 전송"
            )}
          </Button>
        </form>
      )}

      {/* Step: code */}
      {step === "code" && (
        <form
          id={`${formId}-code`}
          onSubmit={codeForm.handleSubmit(onCode)}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`${formId}-email-ro`} className="text-slate-700">
              이메일
            </Label>
            <Input
              id={`${formId}-email-ro`}
              type="email"
              value={email}
              disabled
              className="h-11"
              readOnly
            />
          </div>
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`${formId}-code-input`} className="text-slate-700">
              인증 코드 <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-code-input`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6자리 코드"
              maxLength={6}
              autoFocus
              className="h-11 tracking-[0.35em] text-center text-base font-semibold tabular-nums"
              aria-invalid={!!codeForm.formState.errors.code}
              aria-describedby={
                codeForm.formState.errors.code
                  ? `${formId}-code-err`
                  : expiresHint
                    ? `${formId}-code-hint`
                    : undefined
              }
              {...codeForm.register("code")}
            />
            {codeForm.formState.errors.code && (
              <p
                id={`${formId}-code-err`}
                className="text-xs text-destructive"
                role="alert"
              >
                {codeForm.formState.errors.code.message}
              </p>
            )}
            {expiresHint && (
              <p
                id={`${formId}-code-hint`}
                className="text-xs text-muted-foreground"
              >
                {expiresHint}
              </p>
            )}
            {devCode && (
              <p
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                role="status"
              >
                개발 모드 코드:{" "}
                <strong className="font-mono tracking-widest">{devCode}</strong>
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 w-full font-semibold"
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                확인 중…
              </>
            ) : (
              "코드 확인"
            )}
          </Button>
          <div className="flex flex-col items-center gap-2 text-sm">
            <button
              type="button"
              onClick={resendCode}
              disabled={busy}
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50 cursor-pointer"
            >
              코드를 받지 못했나요? 다시 보내기
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDevCode(null);
                setStep("email");
              }}
              className="text-slate-500 underline-offset-4 hover:underline disabled:opacity-50 cursor-pointer"
            >
              이메일 변경
            </button>
          </div>
        </form>
      )}

      {/* Step: password */}
      {step === "password" && (
        <form
          id={`${formId}-password`}
          onSubmit={passwordForm.handleSubmit(onPassword)}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`${formId}-email-ro2`} className="text-slate-700">
              이메일
            </Label>
            <Input
              id={`${formId}-email-ro2`}
              type="email"
              value={email}
              disabled
              className="h-11"
              readOnly
            />
          </div>
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`${formId}-pw`} className="text-slate-700">
              새 비밀번호 <span className="text-destructive">*</span>
            </Label>
            <PasswordInput
              id={`${formId}-pw`}
              autoComplete="new-password"
              autoFocus
              className="h-11"
              aria-invalid={!!passwordForm.formState.errors.password}
              aria-describedby={
                passwordForm.formState.errors.password
                  ? `${formId}-pw-err`
                  : `${formId}-pw-hint`
              }
              {...passwordForm.register("password")}
            />
            {passwordForm.formState.errors.password ? (
              <p
                id={`${formId}-pw-err`}
                className="text-xs text-destructive"
                role="alert"
              >
                {passwordForm.formState.errors.password.message}
              </p>
            ) : (
              <p id={`${formId}-pw-hint`} className="text-xs text-muted-foreground">
                10자 이상 · 추측하기 어려운 조합을 권장합니다
              </p>
            )}
          </div>
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`${formId}-pw2`} className="text-slate-700">
              비밀번호 확인 <span className="text-destructive">*</span>
            </Label>
            <PasswordInput
              id={`${formId}-pw2`}
              autoComplete="new-password"
              className="h-11"
              aria-invalid={!!passwordForm.formState.errors.passwordConfirm}
              aria-describedby={
                passwordForm.formState.errors.passwordConfirm
                  ? `${formId}-pw2-err`
                  : undefined
              }
              {...passwordForm.register("passwordConfirm")}
            />
            {passwordForm.formState.errors.passwordConfirm && (
              <p
                id={`${formId}-pw2-err`}
                className="text-xs text-destructive"
                role="alert"
              >
                {passwordForm.formState.errors.passwordConfirm.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 w-full font-semibold"
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                변경 중…
              </>
            ) : (
              "비밀번호 변경"
            )}
          </Button>
        </form>
      )}

      {/* Step: done */}
      {step === "done" && (
        <div className="space-y-6" role="status">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-7" strokeWidth={2} aria-hidden />
            </div>
            <p className="text-center text-sm leading-relaxed text-slate-500">
              <span className="font-medium text-slate-900">{email}</span>
              <br />
              계정의 비밀번호가 업데이트되었습니다.
            </p>
          </div>
          <Button
            className="h-11 w-full font-semibold"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            로그인하러 가기
          </Button>
        </div>
      )}

      {step !== "done" && (
        <p className="text-center text-sm text-slate-500">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            로그인으로 돌아가기
          </Link>
        </p>
      )}
    </div>
  );
}
