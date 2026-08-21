"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminFetchJson } from "@/auth/api/admin-http";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { homePathForRole } from "@/auth/model/admin-auth.types";
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
 * Accept a Cloudflare Admin API business invitation.
 * POST /auth/v2/admin/invitations/accept
 */
export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <InviteAcceptForm token={token} />;
}

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const { status, acceptIssuedSession, admin, homePath } = useAdminAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && admin) {
      router.replace(homePath ?? homePathForRole(admin.role));
    }
  }, [status, admin, homePath, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "booting") return;
    if (password.length < 10) {
      toast.error("비밀번호는 10자 이상이어야 합니다");
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetchJson<{
        accessToken?: string | null;
        admin?: {
          id: string;
          email: string;
          name: string;
          role: string;
          businessId: string | null;
          status?: string;
        };
      }>("/auth/v2/admin/invitations/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
          name: name.trim(),
        }),
        skipAuthRefresh: true,
      });

      if (res.accessToken && res.admin) {
        const role = acceptIssuedSession({
          accessToken: res.accessToken,
          admin: {
            ...res.admin,
            status: res.admin.status ?? "ACTIVE",
          },
        });
        toast.success("가입 완료");
        router.replace(homePathForRole(role));
        return;
      }

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
          <Button type="submit" className="w-full" disabled={loading || status === "booting"}>
            {loading || status === "booting" ? "처리 중…" : "가입 완료"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
