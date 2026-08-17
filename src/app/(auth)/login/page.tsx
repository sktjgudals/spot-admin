"use client";

import { useCallback, useEffect, useState } from "react";
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
import { preloadAppleSignIn, requestAppleIdToken } from "@/auth/oidc/apple-signin";
import { GoogleSignInButton } from "@/auth/oidc/google-gis";
import { publicAppleClientId, publicGoogleClientId } from "@/auth/oidc/public-clients";

const schema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요"),
  rememberMe: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

/** Cloudflare Admin API login. */
export default function LoginPage() {
  const router = useRouter();
  const { status, login, loginWithProvider, homePath, admin } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const googleClientId = publicGoogleClientId();
  const appleClientId = publicAppleClientId();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rememberMe: false },
  });

  const finishOidc = useCallback(
    async (input: { provider: "GOOGLE" | "APPLE"; idToken: string; nonce?: string }) => {
      setLoading(true);
      try {
        const role = await loginWithProvider({
          ...input,
          rememberMe: Boolean(getValues("rememberMe")),
        });
        toast.success("로그인되었습니다");
        router.replace(homePathForRole(role));
      } catch (err) {
        const message =
          err instanceof AdminAuthError
            ? err.message
            : "이 소셜 계정으로 어드민에 들어갈 수 없습니다";
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [getValues, loginWithProvider, router],
  );

  const onGoogleCredential = useCallback(
    (idToken: string) => {
      void finishOidc({ provider: "GOOGLE", idToken });
    },
    [finishOidc],
  );

  const onApple = async () => {
    if (!appleClientId) return;
    setLoading(true);
    try {
      const token = await requestAppleIdToken(appleClientId);
      await finishOidc({ provider: "APPLE", idToken: token.idToken, nonce: token.nonce });
    } catch (err) {
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "Apple 로그인에 실패했습니다");
    }
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const role = await login(data.email, data.password, data.rememberMe);
      toast.success("로그인되었습니다");
      router.replace(homePathForRole(role));
    } catch (err) {
      const message =
        err instanceof AdminAuthError
          ? err.message
          : "이메일 또는 비밀번호가 올바르지 않습니다";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

  useEffect(() => {
    if (appleClientId) void preloadAppleSignIn();
  }, [appleClientId]);

  if (status === "booting") {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
        <p className="text-sm text-muted-foreground">세션 확인 중…</p>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="text-sm text-muted-foreground py-12">이동 중…</div>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Dopa Admin</CardTitle>
        <CardDescription>
          앱에서 쓰는 Google/Apple 계정, 또는 초대 비밀번호로 로그인하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 space-y-3">
          <div className="flex justify-center">
            <GoogleSignInButton
              clientId={googleClientId}
              disabled={loading}
              onCredential={onGoogleCredential}
            />
          </div>
          {appleClientId ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full font-semibold"
              disabled={loading}
              onClick={() => void onApple()}
            >
              Apple로 계속하기
            </Button>
          ) : null}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는 비밀번호
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="admin@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <a
                href="/reset-password"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                비밀번호 찾기
              </a>
            </div>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="rounded border" {...register("rememberMe")} />
            로그인 유지
          </label>
          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        <div className="mt-6 space-y-2 border-t pt-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground">계정이 없으신가요?</p>
          <p>
            앱에서 배정된 업체 담당자는 위 Google/Apple로 들어옵니다. 초대
            메일(<code className="rounded bg-muted px-1">/invite/…</code>)로
            비밀번호를 만든 계정은 아래 폼을 씁니다.
          </p>
          <p>
            Dopa 직원 <strong>슈퍼 어드민</strong>은{" "}
            <a
              href="/signup"
              className="text-primary underline-offset-2 hover:underline font-medium"
            >
              회원가입
            </a>
            에서 @dopa.ing 이메일 인증 후 여러 명 생성할 수 있습니다.
          </p>
          <p>
            비밀번호를 잊으셨다면{" "}
            <a
              href="/reset-password"
              className="text-primary underline-offset-2 hover:underline font-medium"
            >
              비밀번호 찾기
            </a>
            에서 이메일 인증 후 재설정할 수 있습니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
