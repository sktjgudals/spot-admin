"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

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
      // Nest may put code in message
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
 * 비밀번호 찾기 — Nest 3-step (request → verify → complete).
 * UI: Dopa brand purple + multi-step progress (ui-ux-pro-max: forms, a11y, single CTA).
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
      // Uniform response — never claim the account exists
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

  return (
    <Card
      className={cn(
        "w-full max-w-sm shadow-xl shadow-primary/10 ring-primary/10",
        "motion-safe:transition-shadow motion-safe:duration-300",
      )}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20"
            aria-hidden
          >
            {step === "done" ? (
              <CheckCircle2 className="size-5" strokeWidth={2} />
            ) : step === "password" ? (
              <KeyRound className="size-5" strokeWidth={2} />
            ) : step === "code" ? (
              <ShieldCheck className="size-5" strokeWidth={2} />
            ) : (
              <Mail className="size-5" strokeWidth={2} />
            )}
          </div>
          {step !== "done" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2 text-muted-foreground"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              로그인
            </Button>
          )}
        </div>

        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">
            {step === "done" ? "비밀번호 변경 완료" : "비밀번호 찾기"}
          </CardTitle>
          <CardDescription className="leading-relaxed">
            {step === "email" &&
              "가입한 이메일로 인증 코드를 보내 드립니다. 계정이 없어도 동일하게 안내합니다."}
            {step === "code" &&
              "메일로 받은 6자리 코드를 입력하세요. 코드는 약 15분 동안 유효합니다."}
            {step === "password" &&
              "새 비밀번호를 설정하세요. 변경 후 기존 기기 세션은 모두 로그아웃됩니다."}
            {step === "done" &&
              "새 비밀번호로 로그인할 수 있습니다. 보안을 위해 다른 기기에서도 다시 로그인해 주세요."}
          </CardDescription>
        </div>

        {step !== "done" && <StepProgress step={step} />}
      </CardHeader>

      <CardContent>
        {/* Step: email */}
        {step === "email" && (
          <form
            id={`${formId}-email`}
            onSubmit={emailForm.handleSubmit(onEmail)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-email-input`}>
                이메일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${formId}-email-input`}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoFocus
                placeholder="admin@dopa.ing"
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
              <p className="text-xs text-muted-foreground leading-relaxed">
                슈퍼 어드민·업체 어드민 모두 동일하게 복구할 수 있습니다.
              </p>
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
                "인증 코드 받기"
              )}
            </Button>
          </form>
        )}

        {/* Step: code */}
        {step === "code" && (
          <form
            id={`${formId}-code`}
            onSubmit={codeForm.handleSubmit(onCode)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-email-ro`}>이메일</Label>
              <Input
                id={`${formId}-email-ro`}
                type="email"
                value={email}
                disabled
                className="h-11"
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-code-input`}>
                인증 코드 <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${formId}-code-input`}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
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
                  <strong className="tracking-widest font-mono">{devCode}</strong>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                disabled={busy}
                onClick={() => {
                  setDevCode(null);
                  setStep("email");
                }}
              >
                이메일 변경
              </Button>
              <Button
                type="submit"
                className="h-11 flex-1 font-semibold"
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
            </div>
            <button
              type="button"
              onClick={resendCode}
              disabled={busy}
              className="w-full text-center text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50 cursor-pointer"
            >
              코드를 받지 못했나요? 다시 보내기
            </button>
          </form>
        )}

        {/* Step: password */}
        {step === "password" && (
          <form
            id={`${formId}-password`}
            onSubmit={passwordForm.handleSubmit(onPassword)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-email-ro2`}>이메일</Label>
              <Input
                id={`${formId}-email-ro2`}
                type="email"
                value={email}
                disabled
                className="h-11"
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-pw`}>
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
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-pw2`}>
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
          <div className="space-y-5" role="status">
            <div className="flex flex-col items-center gap-3 rounded-xl bg-primary/5 px-4 py-6 ring-1 ring-primary/10">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
                <CheckCircle2 className="size-7" strokeWidth={2} aria-hidden />
              </div>
              <p className="text-center text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{email}</span>
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
      </CardContent>

      {step !== "done" && (
        <CardFooter className="justify-center">
          <p className="text-center text-xs text-muted-foreground">
            비밀번호가 기억나셨나요?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              로그인
            </Link>
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

function StepProgress({ step }: { step: Exclude<Step, "done"> }) {
  const steps: Array<{ key: Exclude<Step, "done">; label: string }> = [
    { key: "email", label: "이메일" },
    { key: "code", label: "인증" },
    { key: "password", label: "새 비밀번호" },
  ];
  const idx = steps.findIndex((s) => s.key === step);

  return (
    <nav aria-label="비밀번호 찾기 단계" className="pt-1">
      <ol className="flex items-center gap-1.5">
        {steps.map((s, i) => {
          const active = i === idx;
          const done = i < idx;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1.5">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-200",
                    active &&
                      "bg-primary text-primary-foreground shadow-sm shadow-primary/30",
                    done && "bg-primary/20 text-primary",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    "truncate text-[10px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  aria-hidden
                  className={cn(
                    "mb-5 h-0.5 w-full max-w-6 shrink-0 rounded-full transition-colors duration-200",
                    i < idx ? "bg-primary/50" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
