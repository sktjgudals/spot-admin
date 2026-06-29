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
import ApplicationActions from "./ApplicationActions";

interface SearchParams {
  partyId?: string;
  status?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function ApplicationsPage({ searchParams }: Props) {
  const session = await auth();
  const businessId = session!.user.businessId!;
  const params = await searchParams;

  const where = {
    party: { businessId },
    ...(params.partyId ? { partyId: params.partyId } : {}),
    ...(params.status ? { status: params.status as "PENDING" | "APPROVED" | "REJECTED" } : {}),
  };

  const applications = await prisma.application.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          email: true,
          averageRating: true,
          profile: { select: { gender: true, birthDate: true } },
        },
      },
      party: { select: { id: true, title: true, date: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">신청 관리</h1>
        <p className="text-sm text-muted-foreground">전체 {applications.length}건</p>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>파티</TableHead>
              <TableHead>신청자</TableHead>
              <TableHead>평점</TableHead>
              <TableHead>신청 메시지</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>신청일</TableHead>
              <TableHead className="w-28">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow key={app.id}>
                <TableCell>
                  <p className="font-medium text-sm whitespace-nowrap">{app.party.title}</p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {app.party.date.toLocaleDateString("ko-KR")}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="font-medium text-sm whitespace-nowrap">{app.user.nickname}</p>
                  <p className="text-xs text-muted-foreground">{app.user.email}</p>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  ⭐ {app.user.averageRating.toFixed(1)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                  {app.message ?? "-"}
                </TableCell>
                <TableCell>
                  {app.status === "PENDING" && (
                    <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300 whitespace-nowrap">
                      대기
                    </Badge>
                  )}
                  {app.status === "APPROVED" && (
                    <Badge className="text-xs bg-green-100 text-green-700 border-0 whitespace-nowrap">
                      승인
                    </Badge>
                  )}
                  {app.status === "REJECTED" && (
                    <Badge variant="destructive" className="text-xs whitespace-nowrap">
                      거절
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {app.createdAt.toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  {app.status === "PENDING" && (
                    <ApplicationActions applicationId={app.id} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
