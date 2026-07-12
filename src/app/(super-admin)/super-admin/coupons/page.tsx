import { prisma } from "@/lib/prisma";
import CouponManager from "./CouponManager";

export default async function CouponsPage() {
  const templates = await prisma.couponTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { coupons: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">쿠폰 관리</h1>
        <p className="text-sm text-muted-foreground">
          쿠폰 템플릿을 만들고 발급합니다. <b>받아가는 쿠폰</b>은 앱 설정의
          &lsquo;받을 수 있는 쿠폰&rsquo;에 노출되어 유저가 직접 수령하고(1인
          1회), <b>시스템 쿠폰</b>은 친구 추천 보상처럼 자동으로만 발급됩니다.
          유효기간은 발급 시점부터 계산됩니다.
        </p>
      </div>

      <CouponManager
        initialTemplates={templates.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          discountAmount: t.discountAmount,
          validDays: t.validDays,
          kind: t.kind,
          isActive: t.isActive,
          issuedCount: t._count.coupons,
        }))}
      />
    </div>
  );
}
