"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminFetchJson } from "@/auth/api/admin-http";
import { setAccessToken } from "@/auth/store/admin-auth.store";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { homePathForRole, normalizeAdminWebRole } from "@/auth/model/admin-auth.types";
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

/**
 * Invite accept — Nest Auth v2 (no NextAuth / no local Prisma invite dual-write).
 * POST /auth/v2/admin/invitations/accept
 */
export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("비밀번호는 10자 이상이어야 합니다");
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetchJson<{
        status?: string;
        accessToken?: string | null;
        admin?: {
          id: string;
          email: string;
          name: string;
          role: string;
          businessId: string | null;
        };
        code?: string;
      }>("/auth/v2/admin/invitations/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
          name: name.trim(),
        }),
        skipAuthRefresh: true,
      });

      if (res.accessToken) {
        setAccessToken(res.accessToken);
        toast.success("가입 완료");
        const role = normalizeAdminWebRole(res.admin?.role ?? "BUSINESS_ADMIN");
        router.replace(role ? homePathForRole(role) : "/login");
        return;
      }

      // ACCOUNT_ACTIVATED_LOGIN_REQUIRED style
      toast.success("계정이 활성화되었습니다. 로그인해 주세요.");
      router.replace("/login");
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "초대 수락에 실패했습니다",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>관리자 가입</CardTitle>
        <CardDescription>
          초대 토큰으로 BUSINESS_ADMIN 비밀번호를 설정합니다 (Auth v2)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호 (10자+)</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={10}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "처리 중…" : "가입 완료"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
