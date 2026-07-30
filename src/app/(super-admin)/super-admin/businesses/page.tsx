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
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import BusinessStatusBadge from "./BusinessStatusBadge";
import BusinessRowActions from "./BusinessRowActions";

interface SearchParams {
  includeDisabled?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function BusinessesPage({ searchParams }: Props) {
  const params = await searchParams;
  const includeDisabled = params.includeDisabled === "1";

  const businesses = await prisma.business.findMany({
    where: includeDisabled
      ? undefined
      : { status: { not: "DISABLED" }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          admins: true,
          parties: true,
          adminUsers: true,
        },
      },
    },
  });

  const totalAll = includeDisabled
    ? businesses.length
    : await prisma.business.count();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">업체 관리</h1>
          <p className="text-sm text-muted-foreground">
            {includeDisabled
              ? `전체 ${businesses.length}개 업체`
              : `운영 중 ${businesses.length}개 · 전체 ${totalAll}개`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:self-start">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={
              <Link
                href={
                  includeDisabled
                    ? "/super-admin/businesses"
                    : "/super-admin/businesses?includeDisabled=1"
                }
              />
            }
          >
            {includeDisabled ? "비활성 숨기기" : "비활성 포함"}
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/super-admin/businesses/new" />}
          >
            <Plus className="w-4 h-4 mr-2" />
            업체 등록
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>업체명</TableHead>
              <TableHead>사업자번호</TableHead>
              <TableHead className="text-center">웹 어드민</TableHead>
              <TableHead className="text-center">앱 어드민</TableHead>
              <TableHead className="text-center">파티</TableHead>
              <TableHead className="text-center">수수료</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-24">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  등록된 업체가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              businesses.map((b) => (
                <TableRow
                  key={b.id}
                  className={
                    b.status === "DISABLED" || b.deletedAt
                      ? "opacity-60"
                      : undefined
                  }
                >
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
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {b.businessNumber ?? "-"}
                  </TableCell>
                  <TableCell className="text-center text-sm">{b._count.admins}</TableCell>
                  <TableCell className="text-center text-sm">{b._count.adminUsers}</TableCell>
                  <TableCell className="text-center text-sm">{b._count.parties}</TableCell>
                  <TableCell className="text-center text-sm whitespace-nowrap">
                    {(b.feeRateBps / 100).toFixed(b.feeRateBps % 100 === 0 ? 0 : 1)}%
                  </TableCell>
                  <TableCell>
                    <BusinessStatusBadge status={b.status} deletedAt={b.deletedAt} />
                  </TableCell>
                  <TableCell>
                    <BusinessRowActions
                      business={{
                        id: b.id,
                        name: b.name,
                        status: b.status,
                        feeRateBps: b.feeRateBps,
                      }}
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
