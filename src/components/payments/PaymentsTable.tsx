import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PaymentStatus, RefundStatus } from "@/generated/prisma";
import {
  paymentBadgeVariant,
  paymentStatusLabel,
  refundBadgeVariant,
  refundStatusLabel,
} from "@/lib/payment-labels";

export interface PaymentRow {
  id: string;
  amount: number;
  status: PaymentStatus;
  createdAt: Date;
  party: { title: string; date: Date };
  user: { nickname: string } | null;
  refunds: { status: RefundStatus }[];
}

/** 결제내역 목록 테이블 (슈퍼어드민/업체 공용). 행 클릭 시 상세로 이동. */
export default function PaymentsTable({
  rows,
  detailBase,
}: {
  rows: PaymentRow[];
  detailBase: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-background p-8 sm:p-12 text-center text-muted-foreground">
        <p className="text-sm">결제 내역이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background overflow-x-auto">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>파티</TableHead>
            <TableHead>참가자</TableHead>
            <TableHead>금액</TableHead>
            <TableHead>결제 상태</TableHead>
            <TableHead>환불</TableHead>
            <TableHead>결제일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            // 최신 환불(첫 요소, 정렬은 조회 측에서 desc) 상태만 표기
            const refund = p.refunds[0] ?? null;
            return (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-accent/50"
              >
                <TableCell className="p-0">
                  <Link href={`${detailBase}/${p.id}`} className="block px-4 py-3">
                    <p className="font-medium text-sm whitespace-nowrap">{p.party.title}</p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {p.party.date.toLocaleDateString("ko-KR")}
                    </p>
                  </Link>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {p.user?.nickname ?? "-"}
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">
                  ₩{p.amount.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={paymentBadgeVariant(p.status)} className="text-xs whitespace-nowrap">
                    {paymentStatusLabel[p.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {refund ? (
                    <Badge variant={refundBadgeVariant(refund.status)} className="text-xs whitespace-nowrap">
                      {refundStatusLabel[refund.status]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {p.createdAt.toLocaleDateString("ko-KR")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
