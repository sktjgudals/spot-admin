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
import RoleRequestActions from "./RoleRequestActions";

export default async function BusinessRoleRequestsPage() {
  const [requests, businesses] = await Promise.all([
    prisma.businessRoleRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, nickname: true, email: true } },
      },
    }),
    prisma.business.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">업체 권한 신청</h1>
        <p className="text-sm text-muted-foreground">
          앱에서 신청한 대기 건 {requests.length}개
        </p>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>신청자</TableHead>
              <TableHead>업체명</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>신청일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  대기 중인 신청이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{r.user.nickname}</p>
                    <p className="text-xs text-muted-foreground">{r.user.email}</p>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{r.businessName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[240px]">
                    {r.reason || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {r.createdAt.toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      대기
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RoleRequestActions
                      requestId={r.id}
                      businesses={businesses}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
