"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminFetchJson } from "@/auth/api/admin-http";
import { NestAdminApi } from "@/auth/model/admin-routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface RefundInfo {
  id: string;
  amount: number;
  status: string;
}

interface Props {
  paymentId: string;
  /** 결제 상태 (환불 가능 여부 판단용) */
  paymentStatus: string;
  paymentAmount: number;
  /** 관리자 확인/재시도가 필요한 환불. */
  pendingRefund: RefundInfo | null;
}

/**
 * 결제 상세에서 환불을 처리하는 액션 버튼.
 * - REQUESTED/FAILED/ACTION_REQUIRED: SUPER_ADMIN이 자동 처리기를 재시도
 * - 법정 청약철회·서비스 불이행: 사유와 금액을 남겨 수동 환불
 */
export default function RefundActions({
  paymentId,
  paymentStatus,
  paymentAmount,
  pendingRefund,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState(String(paymentAmount));
  const [manualReason, setManualReason] = useState("");

  const post = async (path: string, body?: unknown, successMsg?: string) => {
    setLoading(true);
    try {
      await adminFetchJson(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      toast.success(successMsg ?? "처리되었습니다");
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "처리에 실패했습니다");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (pendingRefund?.status === "ACTION_REQUIRED") {
      setAccountOpen(true);
      return;
    }
    void post(
      NestAdminApi.refundRetry(pendingRefund!.id),
      {},
      "환불 자동 처리를 재시도했습니다",
    );
  };

  const handleAccountRetry = async () => {
    if (!bank.trim() || !accountNumber.trim() || !holderName.trim()) {
      toast.error("은행 코드, 계좌번호, 예금주를 모두 입력해 주세요");
      return;
    }
    const ok = await post(
      NestAdminApi.refundRetry(pendingRefund!.id),
      {
        refundReceiveAccount: {
          bank: bank.trim(),
          accountNumber: accountNumber.trim(),
          holderName: holderName.trim(),
        },
      },
      "환불 계좌를 저장하고 자동 처리를 재시도했습니다",
    );
    if (ok) {
      setAccountOpen(false);
      setBank("");
      setAccountNumber("");
      setHolderName("");
    }
  };

  const handleManual = async () => {
    const amount = Number(manualAmount);
    if (!Number.isInteger(amount) || amount < 0 || amount > paymentAmount) {
      return toast.error(`환불 금액은 0 ~ ${paymentAmount.toLocaleString()}원 사이여야 합니다`);
    }
    if (!manualReason.trim()) {
      return toast.error("정책 외 수동 환불 사유를 입력해 주세요");
    }
    const ok = await post(
      NestAdminApi.paymentManualRefund(paymentId),
      { amount, reason: manualReason.trim() },
      "환불을 실행했습니다",
    );
    if (ok) {
      setManualOpen(false);
      setManualReason("");
    }
  };

  const canManualRefund =
    !pendingRefund && (paymentStatus === "DONE" || paymentStatus === "PARTIAL_CANCELLED");

  return (
    <div className="flex flex-wrap gap-2">
      {pendingRefund && (
        <Button onClick={handleRetry} disabled={loading}>
          {pendingRefund.status === "ACTION_REQUIRED"
            ? "환불 계좌 입력"
            : `환불 재시도 (₩${pendingRefund.amount.toLocaleString()})`}
        </Button>
      )}

      {canManualRefund && (
        <Button variant="outline" onClick={() => setManualOpen(true)} disabled={loading}>
          수동 환불
        </Button>
      )}

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>가상계좌 환불 계좌</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>은행 코드</Label>
              <Input
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="Toss 은행 코드"
              />
            </div>
            <div className="space-y-1.5">
              <Label>계좌번호</Label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>예금주</Label>
              <Input
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountOpen(false)}>
              닫기
            </Button>
            <Button onClick={handleAccountRetry} disabled={loading}>
              자동 환불 재시도
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수동 환불 다이얼로그 */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>수동 환불</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>환불 금액 (원)</Label>
              <Input
                type="number"
                min={0}
                max={paymentAmount}
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                최대 ₩{paymentAmount.toLocaleString()}. 전액이면 결제가 취소, 일부면 부분
                취소됩니다. Toss로 즉시 환불이 실행됩니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>정책 외 환불 사유 (필수)</Label>
              <Textarea
                placeholder="환불 사유"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              닫기
            </Button>
            <Button onClick={handleManual} disabled={loading}>
              환불 실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
