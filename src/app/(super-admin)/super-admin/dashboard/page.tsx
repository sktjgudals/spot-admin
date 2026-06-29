import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Building2, PartyPopper, ShieldAlert } from "lucide-react";

async function getStats() {
  const [totalUsers, blockedUsers, totalBusinesses, pendingBusinesses, totalParties] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: true } }),
      prisma.business.count(),
      prisma.business.count({ where: { status: "PENDING" } }),
      prisma.party.count(),
    ]);

  return { totalUsers, blockedUsers, totalBusinesses, pendingBusinesses, totalParties };
}

export default async function SuperAdminDashboard() {
  const stats = await getStats();

  const cards = [
    {
      title: "전체 유저",
      value: stats.totalUsers.toLocaleString(),
      sub: `정지 ${stats.blockedUsers}명`,
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "등록 업체",
      value: stats.totalBusinesses.toLocaleString(),
      sub: `승인 대기 ${stats.pendingBusinesses}개`,
      icon: Building2,
      color: "text-green-500",
    },
    {
      title: "전체 파티",
      value: stats.totalParties.toLocaleString(),
      sub: "누적 파티 수",
      icon: PartyPopper,
      color: "text-purple-500",
    },
    {
      title: "정지 계정",
      value: stats.blockedUsers.toLocaleString(),
      sub: "현재 정지 상태",
      icon: ShieldAlert,
      color: "text-red-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-muted-foreground">Dopa 플랫폼 현황</p>
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
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
