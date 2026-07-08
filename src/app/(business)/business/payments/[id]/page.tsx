import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PaymentDetailView from "@/components/payments/PaymentDetailView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BusinessPaymentDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const businessId = session!.user.businessId!;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      party: { select: { id: true, title: true, date: true, location: true, businessId: true } },
      user: { select: { nickname: true, email: true } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });

  // 우리 업체 파티의 결제만 접근 가능
  if (!payment || payment.party.businessId !== businessId) notFound();

  return (
    <PaymentDetailView
      payment={payment}
      apiBase="/api/business"
      backHref="/business/payments"
    />
  );
}
