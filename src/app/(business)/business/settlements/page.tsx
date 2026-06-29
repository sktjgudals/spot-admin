import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default async function SettlementsPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;

  const [settlements, totalNet] = await Promise.all([
    prisma.settlement.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      include: { party: { select: { title: true, date: true } } },
    }),
    prisma.settlement.aggregate({
      where: { businessId, status: "COMPLETED" },
      _sum: { netAmount: true },
    }),
  ]);

  const statusLabel: Record<string, string> = {
    PENDING: "정산 대기",
    COMPLETED: "정산 완료",
    CANCELLED: "취소",
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">정산</h1>
        <p className="text-sm text-muted-foreground">파티별 매출 및 정산 내역</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-sm sm:max-w-md">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              누적 수령액
            </CardTitle>
            <BarChart3 className="w-4 h-4 text-green-500 shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xl sm:text-2xl font-bold">
              ₩{(totalNet._sum.netAmount ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">정산 완료 기준</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              정산 건수
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xl sm:text-2xl font-bold">{settlements.length}</p>
            <p className="text-xs text-muted-foreground mt-1">전체</p>
          </CardContent>
        </Card>
      </div>

      {settlements.length === 0 ? (
        <div className="rounded-md border bg-background p-8 sm:p-12 text-center text-muted-foreground">
          <p className="text-sm">아직 정산 내역이 없습니다.</p>
          <p className="text-xs mt-1">파티 완료 후 자동으로 정산 내역이 생성됩니다.</p>
        </div>
      ) : (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>파티</TableHead>
                <TableHead>총 매출</TableHead>
                <TableHead>수수료</TableHead>
                <TableHead>수령액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>정산일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="font-medium text-sm whitespace-nowrap">{s.party.title}</p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {s.party.date.toLocaleDateString("ko-KR")}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">₩{s.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    ₩{s.feeAmount.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    ₩{s.netAmount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.status === "COMPLETED" ? "secondary" : "outline"}
                      className="text-xs whitespace-nowrap"
                    >
                      {statusLabel[s.status] ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {s.settledAt ? s.settledAt.toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
