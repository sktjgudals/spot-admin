import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft } from "lucide-react";
import type { PaymentStatus, RefundStatus } from "@/generated/prisma";
import {
  paymentBadgeVariant,
  paymentStatusLabel,
  refundBadgeVariant,
  refundStatusLabel,
} from "@/lib/payment-labels";
import RefundActions from "./RefundActions";

export interface PaymentDetailData {
  id: string;
  orderId: string;
  amount: number;
  status: PaymentStatus;
  method: string | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  party: { id: string; title: string; date: Date; location: string };
  user: { nickname: string; email: string } | null;
  refunds: {
    id: string;
    amount: number;
    refundPercent: number;
    status: RefundStatus;
    reason: string | null;
    requestedAt: Date;
    decidedAt: Date | null;
    decidedBy: string | null;
  }[];
}

function fmtDateTime(d: Date | null): string {
  return d ? d.toLocaleString("ko-KR") : "-";
}

/**
 * 결제 상세 + 환불 처리 화면 (슈퍼어드민/업체 공용, 서버 컴포넌트).
 * @param apiBase 환불 액션 API 베이스 ("/api/super-admin" | "/api/business")
 * @param backHref 목록으로 돌아가는 경로
 */
export default function PaymentDetailView({
  payment,
  apiBase,
  backHref,
}: {
  payment: PaymentDetailData;
  apiBase: string;
  backHref: string;
}) {
  const pending = payment.refunds.find((r) => r.status === "REQUESTED") ?? null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          nativeButton={false}
          render={<Link href={backHref} />}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">결제 상세</h1>
          <p className="text-sm text-muted-foreground">{payment.orderId}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>결제 정보</span>
            <Badge variant={paymentBadgeVariant(payment.status)}>
              {paymentStatusLabel[payment.status]}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="결제 금액" value={`₩${payment.amount.toLocaleString()}`} strong />
          <Row label="결제 수단" value={payment.method ?? "-"} />
          <Row label="파티" value={payment.party.title} />
          <Row label="파티 일시" value={fmtDateTime(payment.party.date)} />
          <Row label="장소" value={payment.party.location} />
          <Row
            label="참가자"
            value={payment.user ? `${payment.user.nickname} (${payment.user.email})` : "-"}
          />
          <Row label="결제일" value={fmtDateTime(payment.createdAt)} />
          <Row label="승인 시각" value={fmtDateTime(payment.approvedAt)} />
          {payment.cancelledAt && (
            <Row label="취소 시각" value={fmtDateTime(payment.cancelledAt)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">환불 처리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p className="font-medium">
                환불 요청 대기 중 · ₩{pending.amount.toLocaleString()} ({pending.refundPercent}%)
              </p>
              <p className="text-xs text-muted-foreground">
                참가자가 취소해 규정({pending.refundPercent}%)에 따라 환불이 요청되었습니다.
                승인하면 Toss로 실제 환불이 실행됩니다.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">대기 중인 환불 요청이 없습니다.</p>
          )}

          <RefundActions
            apiBase={apiBase}
            paymentId={payment.id}
            paymentStatus={payment.status}
            paymentAmount={payment.amount}
            pendingRefund={pending ? { id: pending.id, amount: pending.amount, status: pending.status } : null}
          />
        </CardContent>
      </Card>

      {payment.refunds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">환불 이력</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>상태</TableHead>
                  <TableHead>금액</TableHead>
                  <TableHead>비율</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>요청일</TableHead>
                  <TableHead>처리일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment.refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={refundBadgeVariant(r.status)} className="text-xs">
                        {refundStatusLabel[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">₩{r.amount.toLocaleString()}</TableCell>
                    <TableCell>{r.refundPercent}%</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reason ?? "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(r.requestedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(r.decidedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={strong ? "font-semibold text-right" : "text-right"}>{value}</span>
    </div>
  );
}
