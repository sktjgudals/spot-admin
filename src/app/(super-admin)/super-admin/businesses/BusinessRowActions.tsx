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
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Mail } from "lucide-react";
import { BusinessStatus } from "@/generated/prisma";

interface Business {
  id: string;
  name: string;
  status: BusinessStatus;
}

export default function BusinessRowActions({ business }: { business: Business }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    const res = await fetch(`/api/super-admin/businesses/${business.id}/approve`, {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) {
      toast.success(`${business.name} 업체를 승인했습니다`);
      router.refresh();
    } else {
      toast.error("승인에 실패했습니다");
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return toast.error("이메일을 입력하세요");
    setLoading(true);
    const res = await fetch(`/api/super-admin/businesses/${business.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success("초대 링크가 생성되었습니다");
      await navigator.clipboard.writeText(data.inviteUrl).catch(() => null);
      toast.info("초대 링크가 클립보드에 복사되었습니다");
      setInviteOpen(false);
      setInviteEmail("");
    } else {
      toast.error("초대 링크 생성에 실패했습니다");
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
          {business.status === "PENDING" && (
            <DropdownMenuItem onClick={handleApprove} disabled={loading}>
              승인
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setInviteOpen(true)}>
            <Mail className="w-4 h-4 mr-2" />
            담당자 초대
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            업체 정지
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{business.name} — 담당자 초대</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>초대할 이메일</Label>
              <Input
                type="email"
                placeholder="manager@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              취소
            </Button>
            <Button onClick={handleInvite} disabled={loading}>
              초대 링크 생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
