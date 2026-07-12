"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

const ROLE_LABEL: Record<UserRole, string> = {
  USER: "일반 유저",
  ADMIN: "업체 어드민",
  SUPER_ADMIN: "슈퍼 어드민",
};

interface Business {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  nickname: string;
  role: UserRole;
  isBlocked: boolean;
  currentBusinessId: string | null;
  businesses: Business[];
}

export default function UserDetailActions({
  userId,
  nickname,
  role,
  isBlocked,
  currentBusinessId,
  businesses,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>(role);
  const [businessId, setBusinessId] = useState<string>(currentBusinessId ?? "");

  async function call(path: string, body?: object) {
    setLoading(true);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setLoading(false);
    return res;
  }

  async function handleBan() {
    if (!reason.trim()) return toast.error("정지 사유를 입력하세요");
    const res = await call(`/api/super-admin/users/${userId}/ban`, { reason });
    if (res.ok) {
      toast.success(`${nickname} 계정을 정지했습니다`);
      setReason("");
      router.refresh();
    } else {
      toast.error("정지 처리에 실패했습니다");
    }
  }

  async function handleUnban() {
    const res = await call(`/api/super-admin/users/${userId}/unban`);
    if (res.ok) {
      toast.success(`${nickname} 정지를 해제했습니다`);
      router.refresh();
    } else {
      toast.error("정지 해제에 실패했습니다");
    }
  }

  async function handleRole() {
    if (selectedRole === "ADMIN" && !businessId) {
      return toast.error("업체 어드민은 담당 업체를 선택해야 합니다");
    }
    const res = await call(`/api/super-admin/users/${userId}/role`, {
      role: selectedRole,
      ...(selectedRole === "ADMIN" ? { businessId } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`권한을 ${ROLE_LABEL[selectedRole]}(으)로 변경했습니다`);
      router.refresh();
    } else {
      toast.error(data?.message ?? "권한 변경에 실패했습니다");
    }
  }

  return (
    <div className="space-y-4">
      {/* 계정 정지 */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">계정 정지</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3">
          {isBlocked ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                현재 <span className="font-medium text-destructive">정지</span> 상태입니다.
              </p>
              <Button variant="outline" onClick={handleUnban} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                정지 해제
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label>정지 사유</Label>
                <Input
                  placeholder="정지 사유를 입력하세요"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <Button variant="destructive" onClick={handleBan} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                정지하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 권한 부여 */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">권한 부여</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3">
          <div className="space-y-1.5">
            <Label>권한</Label>
            <Select
              value={selectedRole}
              onValueChange={(v) => v && setSelectedRole(v as UserRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRole === "ADMIN" && (
            <div className="space-y-1.5">
              <Label>담당 업체 *</Label>
              {businesses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  활성 업체가 없습니다. 먼저 업체를 등록/승인하세요.
                </p>
              ) : (
                <Select value={businessId} onValueChange={(v) => v && setBusinessId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="업체를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <Button
            onClick={handleRole}
            disabled={
              loading ||
              (selectedRole === role &&
                (selectedRole !== "ADMIN" || businessId === currentBusinessId))
            }
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            권한 변경
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
