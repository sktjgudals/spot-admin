import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";

export default async function BusinessPartiesPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;

  const parties = await prisma.party.findMany({
    where: { businessId },
    orderBy: { date: "desc" },
    include: {
      _count: {
        select: { applications: true },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">파티 관리</h1>
          <p className="text-sm text-muted-foreground">전체 {parties.length}개</p>
        </div>
        <Button render={<Link href="/business/parties/new" />}>
          <Plus className="w-4 h-4 mr-2" />
          파티 등록
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>파티명</TableHead>
              <TableHead>일시</TableHead>
              <TableHead>장소</TableHead>
              <TableHead>정원</TableHead>
              <TableHead>신청</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-16">수정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parties.map((party) => (
              <TableRow key={party.id}>
                <TableCell className="font-medium">{party.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {party.date.toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-sm">{party.location}</TableCell>
                <TableCell>
                  {party.currentCount} / {party.maxCapacity}
                </TableCell>
                <TableCell>{party._count.applications}</TableCell>
                <TableCell>
                  {party.isActive ? (
                    <Badge variant="secondary" className="text-xs">
                      모집중
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      종료
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    render={<Link href={`/business/parties/${party.id}/edit`} />}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
