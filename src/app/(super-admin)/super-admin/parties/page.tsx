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
import PartyBusinessMapper from "./PartyBusinessMapper";
import StartPartyButton from "@/components/start-party-button";
import ClosePartyButton from "@/components/close-party-button";

interface SearchParams {
  q?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function SuperAdminPartiesPage({ searchParams }: Props) {
  const params = await searchParams;

  const where = params.q
    ? {
        OR: [
          { title: { contains: params.q, mode: "insensitive" as const } },
          { location: { contains: params.q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [parties, businesses] = await Promise.all([
    prisma.party.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        business: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
        chatRoom: { select: { id: true } },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">파티 관리</h1>
          <p className="text-sm text-muted-foreground">전체 {parties.length}개</p>
        </div>
        <Button nativeButton={false} render={<Link href="/super-admin/parties/new" />} className="sm:self-start">
          <Plus className="w-4 h-4 mr-2" />
          파티 등록
        </Button>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>파티명</TableHead>
              <TableHead>일시</TableHead>
              <TableHead>장소</TableHead>
              <TableHead className="text-center">정원</TableHead>
              <TableHead className="text-center">신청</TableHead>
              <TableHead>연결 업체</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parties.map((party) => (
              <TableRow key={party.id}>
                <TableCell>
                  <Link
                    href={`/super-admin/parties/${party.id}`}
                    className="font-medium text-sm whitespace-nowrap text-primary hover:underline"
                  >
                    {party.title}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {party.date.toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{party.location}</TableCell>
                <TableCell className="text-sm text-center">
                  {party.currentCount}/{party.maxCapacity}
                </TableCell>
                <TableCell className="text-sm text-center">{party._count.applications}</TableCell>
                <TableCell>
                  <PartyBusinessMapper
                    partyId={party.id}
                    currentBusinessId={party.business?.id ?? null}
                    currentBusinessName={party.business?.name ?? null}
                    businesses={businesses}
                  />
                </TableCell>
                <TableCell>
                  {new Date(party.date) < new Date() ? (
                    <Badge variant="outline" className="text-xs text-muted-foreground whitespace-nowrap">기간 만료</Badge>
                  ) : party.isActive ? (
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">모집중</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground whitespace-nowrap">종료</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {party.isActive && (
                      party.chatRoom ? (
                        <ClosePartyButton
                          partyId={party.id}
                          partyTitle={party.title}
                          isActive={party.isActive}
                        />
                      ) : (
                        <StartPartyButton
                          endpoint={`/api/super-admin/parties/${party.id}/start`}
                          partyTitle={party.title}
                        />
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
