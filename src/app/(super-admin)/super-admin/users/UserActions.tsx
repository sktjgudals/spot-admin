"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { bffFetch } from "@/lib/fetch-json";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

const ROLE_LABEL: Record<UserRole, string> = {
  USER: "일반 유저",
  ADMIN: "업체 어드민",
  SUPER_ADMIN: "슈퍼 어드민",
};

interface User {
  id: string;
  nickname: string;
  email: string;
  isBlocked: boolean;
  role: UserRole;
}

interface BusinessOption {
  id: string;
  name: string;
}

export default function UserActions({ user }: { user: User }) {
  const router = useRouter();
  const [banOpen, setBanOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [loadingBiz, setLoadingBiz] = useState(false);

  const callApi = async (path: string, body?: object) => {
    setLoading(true);
    const res = await bffFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setLoading(false);
    return res;
  };

  useEffect(() => {
    if (!adminOpen) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadingBiz(true);
      try {
        const res = await bffFetch("/api/super-admin/businesses?status=ACTIVE");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          toast.error(data?.message ?? "업체 목록을 불러오지 못했습니다");
          setBusinesses([]);
          return;
        }
        const list = Array.isArray(data) ? data : (data.businesses ?? []);
        setBusinesses(
          list.map((b: { id: string; name: string }) => ({
            id: b.id,
            name: b.name,
          })),
        );
      } catch {
        if (!cancelled) toast.error("업체 목록을 불러오지 못했습니다");
      } finally {
        if (!cancelled) setLoadingBiz(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminOpen]);

  const handleBan = async () => {
    if (!reason.trim()) return toast.error("사유를 입력하세요");
    const res = await callApi(`/api/super-admin/users/${user.id}/ban`, { reason });
    if (res.ok) {
      toast.success(`${user.nickname} 계정을 정지했습니다`);
      setBanOpen(false);
      router.refresh();
    } else {
      toast.error("정지 처리에 실패했습니다");
    }
  };

  const handleUnban = async () => {
    const res = await callApi(`/api/super-admin/users/${user.id}/unban`);
    if (res.ok) {
      toast.success(`${user.nickname} 계정 정지를 해제했습니다`);
      router.refresh();
    } else {
      toast.error("정지 해제에 실패했습니다");
    }
  };

  const handleRole = async (role: UserRole, bizId?: string) => {
    if (role === user.role && role !== "ADMIN") return;
    if (role === "ADMIN" && !bizId) {
      return toast.error("담당 업체를 선택하세요");
    }
    const res = await callApi(`/api/super-admin/users/${user.id}/role`, {
      role,
      ...(role === "ADMIN" ? { businessId: bizId } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`${user.nickname} 권한을 ${ROLE_LABEL[role]}(으)로 변경했습니다`);
      setAdminOpen(false);
      setBusinessId("");
      router.refresh();
    } else {
      toast.error(data?.message ?? "권한 변경에 실패했습니다");
    }
  };

  const onPickRole = (role: UserRole) => {
    if (role === "ADMIN") {
      setAdminOpen(true);
      return;
    }
    void handleRole(role);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
        >
          <MoreHorizontal className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user.isBlocked ? (
            <DropdownMenuItem onClick={handleUnban} disabled={loading}>
              정지 해제
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setBanOpen(true)}>
              계정 정지
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              권한 부여
            </DropdownMenuLabel>
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
              <DropdownMenuItem
                key={r}
                disabled={loading || (r === user.role && r !== "ADMIN")}
                onClick={() => onPickRole(r)}
              >
                {ROLE_LABEL[r]}
                {r === user.role && " ✓"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user.nickname} 계정 정지</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>정지 사유</Label>
              <Input
                placeholder="정지 사유를 입력하세요"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleBan} disabled={loading}>
              정지하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={adminOpen}
        onOpenChange={(open) => {
          setAdminOpen(open);
          if (!open) setBusinessId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user.nickname} → 업체 어드민</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              앱 로그인 유저({user.email})를 담당 업체의 앱 어드민으로 지정합니다.
              웹 어드민(이메일/비밀번호)과는 별개입니다.
            </p>
            <div className="space-y-1.5">
              <Label>담당 업체 *</Label>
              {loadingBiz ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  업체 목록 불러오는 중…
                </div>
              ) : businesses.length === 0 ? (
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => handleRole("ADMIN", businessId)}
              disabled={loading || !businessId || loadingBiz}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              업체 어드민 지정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
