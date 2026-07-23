"use client";

import { useEffect, useState } from "react";
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

const schema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요"),
  rememberMe: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Auth v2 login (Nest). Does not use NextAuth.
 * Existing /super-admin and /business routes still use NextAuth until cutover.
 */
export default function LoginPage() {
  const router = useRouter();
  const { status, login, homePath, admin } = useAdminAuth();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rememberMe: false },
  });

  // Already authenticated → role home (avoid login flash after restore)
  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

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

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Dopa Admin</CardTitle>
        <CardDescription>
          Auth v2 · 어드민 계정으로 로그인하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            <Label htmlFor="password">비밀번호</Label>
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
