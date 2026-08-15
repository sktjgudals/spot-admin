"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
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
  completeBootstrap,
  fetchBootstrapStatus,
  requestBootstrapCode,
  verifyBootstrapCode,
} from "@/auth/api/admin-bootstrap.api";

type Step = "loading" | "email" | "code" | "password";

const emailSchema = z.object({
  email: z
    .string()
    .email("올바른 이메일을 입력하세요")
    .refine((v) => v.trim().toLowerCase().endsWith("@dopa.ing"), {
      message: "내부 도메인(@dopa.ing) 이메일만 사용할 수 있습니다",
    }),
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
    name: z.string().min(1, "이름을 입력하세요").max(80),
    password: z
      .string()
      .min(10, "비밀번호는 10자 이상이어야 합니다"),
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["passwordConfirm"],
  });

type EmailValues = z.infer<typeof emailSchema>;
type CodeValues = z.infer<typeof codeSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

function mapBootstrapError(err: unknown): string {
  if (!(err instanceof AdminAuthError)) {
    return "요청에 실패했습니다. 잠시 후 다시 시도하세요.";
  }
  const code = err.message || err.code;
  switch (code) {
    case "BOOTSTRAP_ALREADY_COMPLETED":
      // 레거시 서버 응답 — 추가 가입 허용 배포 전이면 안내
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
 * SUPER_ADMIN 회원가입 (Nest bootstrap 3-step).
 * @dopa.ing 직원은 여러 명 가입 가능. 업체 계정은 초대 링크(/invite/…)로만 가입.
 */
export default function SuperAdminSignupPage() {
  const router = useRouter();
  const { status, acceptIssuedSession, admin, homePath } = useAdminAuth();
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    defaultValues: { name: "", password: "", passwordConfirm: "" },
  });

  // Already signed in
  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

  // @dopa.ing 직원 SUPER_ADMIN 가입은 여러 명 허용 — status.open 만 확인
  useEffect(() => {
    if (status === "booting" || status === "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchBootstrapStatus();
        if (cancelled) return;
        // open === false 인 구버전/특수 환경만 막음. 기본·신규 API 는 open:true
        if (s.open === false) {
          toast.error("현재 슈퍼 어드민 공개 가입이 비활성화되어 있습니다.");
        }
        setStep("email");
      } catch {
        if (cancelled) return;
        setStep("email");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "booting" || step === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
        <p className="text-sm text-muted-foreground">확인 중…</p>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="text-sm text-muted-foreground py-12">이동 중…</div>
    );
  }

  const onEmail = async (data: EmailValues) => {
    setBusy(true);
    try {
      const res = await requestBootstrapCode(data.email.trim());
      setEmail(res.email);
      setDevCode(res.devCode ?? null);
      codeForm.reset({ code: "" });
      setStep("code");
      toast.success(
        res.devCode
          ? `개발용 코드: ${res.devCode}`
          : "인증 코드를 이메일로 보냈습니다",
      );
    } catch (err) {
      toast.error(mapBootstrapError(err));
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (data: CodeValues) => {
    setBusy(true);
    try {
      const res = await verifyBootstrapCode({
        email,
        code: data.code.trim(),
      });
      setSetupToken(res.setupToken);
      passwordForm.reset({ name: "", password: "", passwordConfirm: "" });
      setStep("password");
      toast.success("이메일 인증이 완료되었습니다");
    } catch (err) {
      toast.error(mapBootstrapError(err));
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!email || busy) return;
    setBusy(true);
    try {
      const res = await requestBootstrapCode(email);
      setDevCode(res.devCode ?? null);
      codeForm.reset({ code: "" });
      toast.success(
        res.devCode
          ? `개발용 코드: ${res.devCode}`
          : "인증 코드를 다시 보냈습니다. 메일함·스팸함을 확인해 주세요.",
      );
    } catch (err) {
      toast.error(mapBootstrapError(err));
    } finally {
      setBusy(false);
    }
  };

  const onPassword = async (data: PasswordValues) => {
    setBusy(true);
    try {
      const completed = await completeBootstrap({
        setupToken,
        password: data.password,
        name: data.name.trim(),
      });
      const role = acceptIssuedSession(completed);
      toast.success("슈퍼 어드민 계정이 생성되었습니다");
      router.replace(homePathForRole(role));
    } catch (err) {
      toast.error(mapBootstrapError(err));
      if (
        err instanceof AdminAuthError &&
        (err.message === "INVALID_OR_EXPIRED_SETUP_TOKEN" ||
          err.code === "INVALID_OR_EXPIRED_SETUP_TOKEN")
      ) {
        setSetupToken("");
        setStep("email");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">슈퍼 어드민 가입</CardTitle>
        <CardDescription>
          Dopa 직원(@dopa.ing) · 이메일 인증 후 비밀번호 설정 · 여러 명 가입 가능
        </CardDescription>
        <StepIndicator step={step} />
      </CardHeader>
      <CardContent>
        {step === "email" && (
          <form
            onSubmit={emailForm.handleSubmit(onEmail)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@dopa.ing"
                {...emailForm.register("email")}
              />
              {emailForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {emailForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "전송 중…" : "인증 코드 받기"}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form
            onSubmit={codeForm.handleSubmit(onCode)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email-ro">이메일</Label>
              <Input id="email-ro" type="email" value={email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">인증 코드 (6자리)</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                {...codeForm.register("code")}
              />
              {codeForm.formState.errors.code && (
                <p className="text-xs text-destructive">
                  {codeForm.formState.errors.code.message}
                </p>
              )}
              {devCode && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  개발 모드 코드: <strong className="tracking-widest">{devCode}</strong>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setDevCode(null);
                  setStep("email");
                }}
              >
                이메일 변경
              </Button>
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? "확인 중…" : "코드 확인"}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => void resendCode()}
              disabled={busy || !email}
              className="w-full text-center text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50 cursor-pointer"
            >
              코드를 받지 못했나요? 다시 보내기
            </button>
          </form>
        )}

        {step === "password" && (
          <form
            onSubmit={passwordForm.handleSubmit(onPassword)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email-ro2">이메일</Label>
              <Input id="email-ro2" type="email" value={email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                autoComplete="name"
                placeholder="운영자 이름"
                {...passwordForm.register("name")}
              />
              {passwordForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호 (10자 이상)</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                {...passwordForm.register("password")}
              />
              {passwordForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
              <PasswordInput
                id="passwordConfirm"
                autoComplete="new-password"
                {...passwordForm.register("passwordConfirm")}
              />
              {passwordForm.formState.errors.passwordConfirm && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.passwordConfirm.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "가입 중…" : "슈퍼 어드민 계정 만들기"}
            </Button>
          </form>
        )}

        <div className="mt-6 space-y-2 border-t pt-4 text-xs text-muted-foreground leading-relaxed">
          <p>
            이미 계정이 있으면{" "}
            <Link href="/login" className="text-primary underline-offset-2 hover:underline">
              로그인
            </Link>
            하세요.
          </p>
          <p>
            <strong>@dopa.ing</strong> 직원만 슈퍼 어드민으로 가입할 수 있습니다.
            업체 담당자는 초대 메일 <code className="rounded bg-muted px-1">/invite/…</code> 로 가입합니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const order: Array<"email" | "code" | "password"> = [
    "email",
    "code",
    "password",
  ];
  if (step === "loading") return null;
  const labels = { email: "이메일", code: "인증", password: "비밀번호" };
  const idx = order.indexOf(step);
  return (
    <ol className="flex gap-2 pt-2 text-[11px] font-medium text-muted-foreground">
      {order.map((s, i) => (
        <li
          key={s}
          className={
            i === idx
              ? "text-foreground"
              : i < idx
                ? "text-primary"
                : undefined
          }
        >
          {i + 1}. {labels[s]}
          {i < order.length - 1 ? " ·" : ""}
        </li>
      ))}
    </ol>
  );
}
