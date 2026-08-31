"use client";

import { useId, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod/mini";
import { formResolver } from "@/lib/form-resolver";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

export type EmailCodeStep = "email" | "code" | "password" | "done";

export const emailCodeSchema = z.object({
  code: z.string().check(
    z.minLength(6, "인증 코드 6자리를 입력하세요"),
    z.maxLength(6, "인증 코드 6자리를 입력하세요"),
    z.regex(/^\d{6}$/, "숫자 6자리 코드를 입력하세요"),
  ),
});

export function passwordSchema(includeName: boolean) {
  const base = z.object({
    name: includeName
      ? z.string().check(
          z.minLength(1, "이름을 입력하세요"),
          z.maxLength(80),
        )
      : z.optional(z.string()),
    password: z.string().check(
      z.minLength(10, "비밀번호는 10자 이상이어야 합니다"),
    ),
    passwordConfirm: z.string(),
  });
  return base.check(
    z.refine((data) => data.password === data.passwordConfirm, {
      message: "비밀번호가 일치하지 않습니다",
      path: ["passwordConfirm"],
    }),
  );
}

type EmailValues = { email: string };
type CodeValues = z.infer<typeof emailCodeSchema>;
type PasswordValues = {
  name?: string;
  password: string;
  passwordConfirm: string;
};

export type EmailCodeWizardConfig = {
  copy: Record<EmailCodeStep, { title: string; description: string }>;
  emailSchema: z.ZodMiniType<EmailValues>;
  includeName?: boolean;
  showBrand?: boolean;
  showDone?: boolean;
  emailPlaceholder?: string;
  labels: {
    sendCode: string;
    verifyCode: string;
    complete: string;
    completing: string;
  };
  requestCode: (email: string) => Promise<{
    email?: string;
    devCode?: string | null;
    expiresAt?: string;
  }>;
  verifyCode: (input: { email: string; code: string }) => Promise<{ setupToken: string }>;
  complete: (input: {
    setupToken: string;
    password: string;
    name?: string;
  }) => Promise<void>;
  mapError: (err: unknown) => string;
  requestSuccess: (devCode?: string | null) => string;
  verifySuccess: string;
  completeSuccess?: string;
  footer?: ReactNode;
  doneHref?: string;
  doneLabel?: string;
};

export function EmailCodeWizard({ config }: { config: EmailCodeWizardConfig }) {
  const formId = useId();
  const includeName = config.includeName === true;
  const [step, setStep] = useState<EmailCodeStep>("email");
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiresHint, setExpiresHint] = useState<string | null>(null);

  const emailForm = useForm<EmailValues>({
    resolver: formResolver<EmailValues>(config.emailSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<CodeValues>({
    resolver: formResolver<CodeValues>(emailCodeSchema),
    defaultValues: { code: "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: formResolver<PasswordValues>(passwordSchema(includeName)),
    defaultValues: { name: "", password: "", passwordConfirm: "" },
  });

  const copy = config.copy[step];

  const onEmail = async (data: EmailValues) => {
    setBusy(true);
    try {
      const res = await config.requestCode(data.email.trim());
      const normalized = (res.email ?? data.email).trim().toLowerCase();
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
      toast.success(config.requestSuccess(res.devCode));
    } catch (err) {
      toast.error(config.mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (data: CodeValues) => {
    setBusy(true);
    try {
      const res = await config.verifyCode({ email, code: data.code.trim() });
      setSetupToken(res.setupToken);
      passwordForm.reset({ name: "", password: "", passwordConfirm: "" });
      setStep("password");
      toast.success(config.verifySuccess);
    } catch (err) {
      toast.error(config.mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const onPassword = async (data: PasswordValues) => {
    setBusy(true);
    try {
      await config.complete({
        setupToken,
        password: data.password,
        name: data.name?.trim(),
      });
      if (config.showDone) {
        setStep("done");
      }
      if (config.completeSuccess) toast.success(config.completeSuccess);
    } catch (err) {
      toast.error(config.mapError(err));
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
      const res = await config.requestCode(email);
      setDevCode(res.devCode ?? null);
      toast.success(config.requestSuccess(res.devCode));
    } catch (err) {
      toast.error(config.mapError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="flex flex-col items-center space-y-4 text-center">
        {config.showBrand !== false && (
          <div className="flex items-center gap-2">
            <Image
              src="/dopa-logo.png"
              alt="Dopa"
              width={36}
              height={36}
              className="object-contain"
              priority
            />
            <span className="text-base font-semibold tracking-wide text-foreground">
              DOPA
            </span>
          </div>
        )}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            {copy.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        </div>
      </div>

      {step === "email" && (
        <form
          id={`${formId}-email`}
          onSubmit={emailForm.handleSubmit(onEmail)}
          className="space-y-5"
          noValidate
        >
          <Field
            id={`${formId}-email-input`}
            label="이메일"
            error={emailForm.formState.errors.email?.message}
          >
            <Input
              id={`${formId}-email-input`}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              placeholder={config.emailPlaceholder ?? "이메일을 입력해주세요."}
              className="h-11"
              {...emailForm.register("email")}
            />
          </Field>
          <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                전송 중…
              </>
            ) : (
              config.labels.sendCode
            )}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form
          id={`${formId}-code`}
          onSubmit={codeForm.handleSubmit(onCode)}
          className="space-y-5"
          noValidate
        >
          <Field id={`${formId}-email-ro`} label="이메일">
            <Input id={`${formId}-email-ro`} type="email" value={email} disabled className="h-11" readOnly />
          </Field>
          <Field
            id={`${formId}-code-input`}
            label="인증 코드"
            error={codeForm.formState.errors.code?.message}
          >
            <Input
              id={`${formId}-code-input`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6자리 코드"
              maxLength={6}
              autoFocus
              className="h-11 tracking-[0.35em] text-center text-base font-semibold tabular-nums"
              {...codeForm.register("code")}
            />
            {expiresHint && (
              <p className="text-xs text-muted-foreground">{expiresHint}</p>
            )}
            {devCode && (
              <p
                className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
                role="status"
              >
                개발 모드 코드:{" "}
                <strong className="font-mono tracking-widest">{devCode}</strong>
              </p>
            )}
          </Field>
          <Button type="submit" className="h-11 w-full font-semibold" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                확인 중…
              </>
            ) : (
              config.labels.verifyCode
            )}
          </Button>
          <div className="flex flex-col items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => void resendCode()}
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
              className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              이메일 변경
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form
          id={`${formId}-password`}
          onSubmit={passwordForm.handleSubmit(onPassword)}
          className="space-y-5"
          noValidate
        >
          <Field id={`${formId}-email-ro2`} label="이메일">
            <Input id={`${formId}-email-ro2`} type="email" value={email} disabled className="h-11" readOnly />
          </Field>
          {includeName && (
            <Field
              id={`${formId}-name`}
              label="이름"
              error={passwordForm.formState.errors.name?.message}
            >
              <Input
                id={`${formId}-name`}
                autoComplete="name"
                placeholder="운영자 이름"
                className="h-11"
                {...passwordForm.register("name")}
              />
            </Field>
          )}
          <Field
            id={`${formId}-pw`}
            label="비밀번호"
            error={passwordForm.formState.errors.password?.message}
          >
            <PasswordInput
              id={`${formId}-pw`}
              autoComplete="new-password"
              autoFocus
              className="h-11"
              {...passwordForm.register("password")}
            />
            {!passwordForm.formState.errors.password && (
              <p className="text-xs text-muted-foreground">
                10자 이상 · 추측하기 어려운 조합을 권장합니다
              </p>
            )}
          </Field>
          <Field
            id={`${formId}-pw2`}
            label="비밀번호 확인"
            error={passwordForm.formState.errors.passwordConfirm?.message}
          >
            <PasswordInput
              id={`${formId}-pw2`}
              autoComplete="new-password"
              className="h-11"
              {...passwordForm.register("passwordConfirm")}
            />
          </Field>
          <Button type="submit" className="h-11 w-full font-semibold" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {config.labels.completing}
              </>
            ) : (
              config.labels.complete
            )}
          </Button>
        </form>
      )}

      {step === "done" && config.showDone && (
        <div className="space-y-6" role="status">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
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
            render={<Link href={config.doneHref ?? "/login"} />}
          >
            {config.doneLabel ?? "로그인하러 가기"}
          </Button>
        </div>
      )}

      {step !== "done" && (
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            로그인으로 돌아가기
          </Link>
        </p>
      )}
      {config.footer}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id} className="text-foreground">
        {label} <span className="text-destructive">*</span>
      </Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
