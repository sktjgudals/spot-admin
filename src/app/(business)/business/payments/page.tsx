import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PaymentsTable from "@/components/payments/PaymentsTable";

export const dynamic = "force-dynamic";

export default async function BusinessPaymentsPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;

  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ["DONE", "CANCELLED", "PARTIAL_CANCELLED"] },
      party: { businessId },
    },
    orderBy: { createdAt: "desc" },
    include: {
      party: { select: { title: true, date: true } },
      user: { select: { nickname: true } },
      refunds: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">결제 / 환불</h1>
        <p className="text-sm text-muted-foreground">
          우리 업체 파티 결제 {payments.length}건. 참가취소 환불 요청을 승인/거절할 수 있습니다.
        </p>
      </div>
      <PaymentsTable rows={payments} detailBase="/business/payments" />
    </div>
  );
}
