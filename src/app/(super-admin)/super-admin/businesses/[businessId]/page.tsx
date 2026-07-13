import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import BusinessStatusBadge from "../BusinessStatusBadge";
import BusinessRowActions from "../BusinessRowActions";
import RefundPolicyEditor from "./RefundPolicyEditor";
import BusinessAdminsManager from "./BusinessAdminsManager";
import BusinessKindEditor from "./BusinessKindEditor";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ businessId: string }>;
}

export default async function BusinessDetailPage({ params }: Props) {
  const { businessId } = await params;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      refundPolicyTiers: { orderBy: { hoursBeforeStart: "desc" } },
      _count: { select: { admins: true, parties: true, settlements: true } },
      admins: {
        where: { role: "BUSINESS" },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!business) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            nativeButton={false}
            render={<Link href="/super-admin/businesses" />}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{business.name}</h1>
              <BusinessStatusBadge status={business.status} />
              <Badge variant="outline" className="text-xs">
                {business.kind === "INDIVIDUAL" ? "개인 사업자" : "일반 업체"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {business.contactEmail ?? "연락 이메일 없음"}
            </p>
          </div>
        </div>
        <BusinessRowActions
          business={{
            id: business.id,
            name: business.name,
            status: business.status,
            feeRateBps: business.feeRateBps,
          }}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">업체 정보</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <BusinessKindEditor businessId={business.id} initialKind={business.kind} />
          <Row label="사업자번호" value={business.businessNumber ?? "-"} />
          <Row label="연락처" value={business.contactPhone ?? "-"} />
          <Row label="주소" value={business.address ?? "-"} />
          <Row
            label="중개 수수료"
            value={`${(business.feeRateBps / 100).toFixed(
              business.feeRateBps % 100 === 0 ? 0 : 1,
            )}%`}
          />
          <Row label="웹 어드민" value={`${business._count.admins}명`} />
          <Row label="파티" value={`${business._count.parties}개`} />
          <Row label="정산" value={`${business._count.settlements}건`} />
          {business.description && (
            <div className="pt-2 border-t">
              <p className="text-muted-foreground mb-1">소개</p>
              <p className="whitespace-pre-wrap">{business.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <BusinessAdminsManager
        businessId={business.id}
        initialAdmins={business.admins}
      />

      <RefundPolicyEditor
        businessId={business.id}
        initialTiers={business.refundPolicyTiers.map((t) => ({
          hoursBeforeStart: t.hoursBeforeStart,
          refundPercent: t.refundPercent,
        }))}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
