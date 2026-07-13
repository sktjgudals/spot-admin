import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PartyPopper,
  Users,
  Clock,
  CheckCircle,
  Percent,
  Eye,
  FileText,
} from "lucide-react";
import {
  DashboardMonthChart,
  PartyViewsCompare,
  type DailySeriesPoint,
  type PartyViewSeries,
} from "./DashboardMonthChart";

/** Asia/Seoul 기준 이번 달 1일 00:00 ~ 다음달 1일 00:00 (UTC Date) */
function kstMonthRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end, year: y, month: m };
}

function formatMd(d: Date) {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function buildDayBuckets(start: Date, end: Date): Map<string, DailySeriesPoint> {
  const map = new Map<string, DailySeriesPoint>();
  for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: formatMd(d), applications: 0, views: 0 });
  }
  return map;
}

export default async function BusinessDashboard() {
  const session = await auth();
  const businessId = session!.user.businessId!;
  const { start, end, year, month } = kstMonthRange();

  const [
    business,
    totalParties,
    totalApplications,
    pendingApplications,
    approvedApplications,
    monthApplications,
    monthViews,
    applicationRows,
    viewRows,
    parties,
  ] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { feeRateBps: true, name: true },
    }),
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
    prisma.application.count({
      where: {
        party: { businessId },
        createdAt: { gte: start, lt: end },
      },
    }),
    prisma.partyDailyStat.aggregate({
      where: {
        party: { businessId },
        date: { gte: start, lt: end },
      },
      _sum: { viewCount: true },
    }),
    prisma.application.findMany({
      where: {
        party: { businessId },
        createdAt: { gte: start, lt: end },
      },
      select: { createdAt: true },
    }),
    prisma.partyDailyStat.findMany({
      where: {
        party: { businessId },
        date: { gte: start, lt: end },
      },
      select: { date: true, viewCount: true, partyId: true },
    }),
    prisma.party.findMany({
      where: { businessId },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const buckets = buildDayBuckets(start, end);
  const dateKeys = [...buckets.keys()];

  for (const row of applicationRows) {
    const kstKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(row.createdAt);
    const b = buckets.get(kstKey);
    if (b) b.applications += 1;
  }

  for (const row of viewRows) {
    const key = row.date.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) b.views += row.viewCount;
  }

  const partyMap = new Map<string, PartyViewSeries>();
  for (const p of parties) {
    partyMap.set(p.id, {
      partyId: p.id,
      title: p.title,
      totalViews: 0,
      byDate: {},
    });
  }
  for (const row of viewRows) {
    let series = partyMap.get(row.partyId);
    if (!series) {
      series = {
        partyId: row.partyId,
        title: `(삭제된 파티)`,
        totalViews: 0,
        byDate: {},
      };
      partyMap.set(row.partyId, series);
    }
    const key = row.date.toISOString().slice(0, 10);
    series.byDate[key] = (series.byDate[key] ?? 0) + row.viewCount;
    series.totalViews += row.viewCount;
  }

  const partySeries = [...partyMap.values()].filter((p) => p.totalViews > 0);
  const chartData = [...buckets.values()];
  const monthViewTotal = monthViews._sum.viewCount ?? 0;
  const feePercent = ((business?.feeRateBps ?? 1000) / 100).toLocaleString(
    "ko-KR",
    { maximumFractionDigits: 2 },
  );

  const cards = [
    {
      title: "내 파티",
      value: totalParties,
      sub: "등록된 파티 수",
      icon: PartyPopper,
      color: "text-primary",
    },
    {
      title: "이번 달 신청",
      value: monthApplications,
      sub: `${year}.${month} 신규 신청`,
      icon: FileText,
      color: "text-indigo-500",
    },
    {
      title: "이번 달 조회",
      value: monthViewTotal,
      sub: "파티 상세 조회수",
      icon: Eye,
      color: "text-teal-500",
    },
    {
      title: "중개 수수료",
      value: `${feePercent}%`,
      sub: `요율 ${business?.feeRateBps ?? 1000} bps`,
      icon: Percent,
      color: "text-amber-500",
      isText: true,
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
        <h1 className="text-xl sm:text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          {session!.user.businessName ?? business?.name} 현황
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
              <p className="text-2xl font-bold">
                {"isText" in card && card.isText
                  ? card.value
                  : Number(card.value).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            이번 달 신청 · 조회 ({year}.{String(month).padStart(2, "0")})
          </CardTitle>
          <CardDescription>
            일별 신청 건수와 파티 상세 조회수(합계)입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthApplications === 0 && monthViewTotal === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              이번 달 아직 신청·조회 데이터가 없습니다.
            </p>
          ) : (
            <DashboardMonthChart data={chartData} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">파티별 조회 비교</CardTitle>
          <CardDescription>
            체크한 파티의 일별 조회수를 겹쳐 봅니다. 기본으로 상위 5개 파티가
            선택됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PartyViewsCompare dateKeys={dateKeys} parties={partySeries} />
        </CardContent>
      </Card>
    </div>
  );
}
