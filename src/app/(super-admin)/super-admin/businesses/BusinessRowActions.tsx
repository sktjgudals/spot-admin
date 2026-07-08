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
import { MoreHorizontal, Mail, Percent } from "lucide-react";
import { BusinessStatus } from "@/generated/prisma";

interface Business {
  id: string;
  name: string;
  status: BusinessStatus;
  feeRateBps: number;
}

export default function BusinessRowActions({ business }: { business: Business }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  // 사용자에겐 %로 입력받고, 저장 시 bps(×100)로 변환한다.
  const [feePercent, setFeePercent] = useState((business.feeRateBps / 100).toString());

  const handleSaveFee = async () => {
    const percent = Number(feePercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return toast.error("수수료는 0~100% 사이여야 합니다");
    }
    const feeRateBps = Math.round(percent * 100);
    setLoading(true);
    const res = await fetch(`/api/super-admin/businesses/${business.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeRateBps }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(`${business.name} 수수료를 ${percent}%로 설정했습니다`);
      setFeeOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.message ?? "수수료 설정에 실패했습니다");
    }
  };

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
          <DropdownMenuItem onClick={() => setFeeOpen(true)}>
            <Percent className="w-4 h-4 mr-2" />
            수수료 설정
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

      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{business.name} — 중개 수수료 설정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>수수료율 (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder="10"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                파트너 업체는 낮게 설정하세요. 예: 파트너 5%, 일반 10%. 결제 정산 시 이
                비율만큼 플랫폼이 수수료로 차감합니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveFee} disabled={loading}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
