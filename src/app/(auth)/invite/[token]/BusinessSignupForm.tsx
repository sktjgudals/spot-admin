"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    name: z.string().min(2, "이름을 2자 이상 입력하세요"),
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["passwordConfirm"],
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  token: string;
  email: string;
}

export default function BusinessSignupForm({ token, email }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/auth/business-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name: data.name, password: data.password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "가입에 실패했습니다");
      setLoading(false);
      return;
    }

    toast.success("가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
    router.push("/login");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" value={email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">이름</Label>
            <Input id="name" placeholder="담당자 이름" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
            <PasswordInput
              id="passwordConfirm"
              autoComplete="new-password"
              {...register("passwordConfirm")}
            />
            {errors.passwordConfirm && (
              <p className="text-xs text-destructive">
                {errors.passwordConfirm.message}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "가입 중..." : "가입하기"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
