import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PaymentDetailView from "@/components/payments/PaymentDetailView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SuperAdminPaymentDetailPage({ params }: Props) {
  const { id } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      party: { select: { id: true, title: true, date: true, location: true } },
      user: { select: { nickname: true, email: true } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!payment) notFound();

  return (
    <PaymentDetailView
      payment={payment}
      apiBase="/api/super-admin"
      backHref="/super-admin/payments"
    />
  );
}
