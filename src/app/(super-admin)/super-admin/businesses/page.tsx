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
import { Plus } from "lucide-react";
import BusinessStatusBadge from "./BusinessStatusBadge";
import BusinessRowActions from "./BusinessRowActions";

export default async function BusinessesPage() {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { admins: true, parties: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">업체 관리</h1>
          <p className="text-sm text-muted-foreground">
            전체 {businesses.length}개 업체
          </p>
        </div>
        <Button render={<Link href="/super-admin/businesses/new" />}>
          <Plus className="w-4 h-4 mr-2" />
          업체 등록
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>업체명</TableHead>
              <TableHead>사업자번호</TableHead>
              <TableHead>담당자 수</TableHead>
              <TableHead>파티 수</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-24">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link
                    href={`/super-admin/businesses/${b.id}`}
                    className="font-medium hover:underline"
                  >
                    {b.name}
                  </Link>
                  {b.contactEmail && (
                    <p className="text-xs text-muted-foreground">{b.contactEmail}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {b.businessNumber ?? "-"}
                </TableCell>
                <TableCell>{b._count.admins}</TableCell>
                <TableCell>{b._count.parties}</TableCell>
                <TableCell>
                  <BusinessStatusBadge status={b.status} />
                </TableCell>
                <TableCell>
                  <BusinessRowActions business={b} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
