import { prisma } from "@/lib/prisma";
import NotificationForm from "./NotificationForm";
import TestSendCard from "./TestSendCard";

export default async function NotificationsPage() {
  const [userCount, parties] = await Promise.all([
    prisma.user.count({ where: { isBlocked: false } }),
    prisma.party.findMany({
      where: { isActive: true },
      orderBy: { date: "asc" },
      take: 100,
      select: {
        id: true,
        title: true,
        date: true,
        currentCount: true,
        maxCapacity: true,
        _count: { select: { wishlists: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">알림 발송</h1>
        <p className="text-sm text-muted-foreground">
          타겟을 지정해 푸시 알림을 발송합니다. 실제 수신 여부는 각 유저의 알림 수신
          설정에 따라 필터링됩니다.
        </p>
      </div>

      <TestSendCard />

      <NotificationForm
        userCount={userCount}
        parties={parties.map((p) => ({
          id: p.id,
          title: p.title,
          date: p.date.toISOString(),
          currentCount: p.currentCount,
          maxCapacity: p.maxCapacity,
          wishlistCount: p._count.wishlists,
        }))}
      />
    </div>
  );
}
