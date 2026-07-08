import { prisma } from "@/lib/prisma";
import PaymentsTable from "@/components/payments/PaymentsTable";

export const dynamic = "force-dynamic";

export default async function SuperAdminPaymentsPage() {
  const payments = await prisma.payment.findMany({
    where: { status: { in: ["DONE", "CANCELLED", "PARTIAL_CANCELLED"] } },
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
        <p className="text-sm text-muted-foreground">전체 {payments.length}건의 결제 내역</p>
      </div>
      <PaymentsTable rows={payments} detailBase="/super-admin/payments" />
    </div>
  );
}
