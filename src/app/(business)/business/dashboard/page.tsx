import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PartyPopper, Users, Clock, CheckCircle } from "lucide-react";

export default async function BusinessDashboard() {
  const session = await auth();
  const businessId = session!.user.businessId!;

  const [totalParties, totalApplications, pendingApplications, approvedApplications] =
    await Promise.all([
      prisma.party.count({ where: { businessId } }),
      prisma.application.count({
        where: { party: { businessId } },
      }),
      prisma.application.count({
        where: { party: { businessId }, status: "PENDING" },
      }),
      prisma.application.count({
        where: { party: { businessId }, status: "APPROVED" },
      }),
    ]);

  const cards = [
    {
      title: "내 파티",
      value: totalParties,
      sub: "등록된 파티 수",
      icon: PartyPopper,
      color: "text-purple-500",
    },
    {
      title: "전체 신청",
      value: totalApplications,
      sub: "누적 신청 수",
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "대기 중 신청",
      value: pendingApplications,
      sub: "승인 필요",
      icon: Clock,
      color: "text-yellow-500",
    },
    {
      title: "승인된 신청",
      value: approvedApplications,
      sub: "누적 승인 수",
      icon: CheckCircle,
      color: "text-green-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          {session!.user.businessName} 현황
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
