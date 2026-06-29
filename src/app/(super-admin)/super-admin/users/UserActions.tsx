"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  nickname: string;
  email: string;
  isBlocked: boolean;
}

export default function UserActions({ user }: { user: User }) {
  const router = useRouter();
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const callApi = async (path: string, body?: object) => {
    setLoading(true);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setLoading(false);
    return res;
  };

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
          <DropdownMenuItem className="text-destructive">
            회원 탈퇴
          </DropdownMenuItem>
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
    </>
  );
}
