"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  /** API 라우트 베이스: "/api/super-admin" 또는 "/api/business" */
  apiBase: string;
  paymentId: string;
  /** 결제 상태 (환불 가능 여부 판단용) */
  paymentStatus: string;
  paymentAmount: number;
  /** 진행 중(REQUESTED) 환불 요청. 있으면 승인/거절 노출. */
  pendingRefund: RefundInfo | null;
}

/**
 * 결제 상세에서 환불을 처리하는 액션 버튼.
 * - REQUESTED 환불이 있으면: 승인 / 거절
 * - 그 외 DONE/부분취소 결제면: 수동 환불(직접 실행)
 * 실제 Toss 취소는 백엔드 내부 API로 프록시된다.
 */
export default function RefundActions({
  apiBase,
  paymentId,
  paymentStatus,
  paymentAmount,
  pendingRefund,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState(String(paymentAmount));
  const [manualReason, setManualReason] = useState("");

  const post = async (path: string, body?: unknown, successMsg?: string) => {
    setLoading(true);
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setLoading(false);
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast.success(successMsg ?? "처리되었습니다");
      router.refresh();
      return true;
    }
    toast.error(data?.message ?? "처리에 실패했습니다");
    return false;
  };

  const handleApprove = () =>
    post(`/refunds/${pendingRefund!.id}/approve`, {}, "환불을 승인하고 결제를 취소했습니다");

  const handleReject = async () => {
    const ok = await post(
      `/refunds/${pendingRefund!.id}/reject`,
      { reason: rejectReason.trim() || undefined },
      "환불 요청을 거절했습니다",
    );
    if (ok) {
      setRejectOpen(false);
      setRejectReason("");
    }
  };

  const handleManual = async () => {
    const amount = Number(manualAmount);
    if (!Number.isInteger(amount) || amount < 0 || amount > paymentAmount) {
      return toast.error(`환불 금액은 0 ~ ${paymentAmount.toLocaleString()}원 사이여야 합니다`);
    }
    const ok = await post(
      `/payments/${paymentId}/refund`,
      { amount, reason: manualReason.trim() || undefined },
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
        <>
          <Button onClick={handleApprove} disabled={loading}>
            환불 승인 (₩{pendingRefund.amount.toLocaleString()})
          </Button>
          <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={loading}>
            환불 거절
          </Button>
        </>
      )}

      {canManualRefund && (
        <Button variant="outline" onClick={() => setManualOpen(true)} disabled={loading}>
          수동 환불
        </Button>
      )}

      {/* 거절 다이얼로그 */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>환불 요청 거절</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>거절 사유 (선택)</Label>
              <Textarea
                placeholder="예: 환불 규정상 취소 불가 기간입니다"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                거절해도 참가 취소(좌석 반납)는 이미 반영된 상태입니다. 환불(금액)만
                진행되지 않습니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              닫기
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              거절하기
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
              <Label>사유 (선택)</Label>
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
