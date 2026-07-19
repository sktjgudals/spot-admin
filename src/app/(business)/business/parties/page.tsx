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
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import PartyVisibilityToggle from "./PartyVisibilityToggle";
import StartPartyButton from "@/components/start-party-button";
import ClosePartyButton from "@/components/close-party-button";
import { Badge } from "@/components/ui/badge";

export default async function BusinessPartiesPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;

  const parties = await prisma.party.findMany({
    where: { businessId },
    orderBy: { date: "desc" },
    include: {
      _count: { select: { applications: true } },
      chatRoom: { select: { id: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">파티 관리</h1>
          <p className="text-sm text-muted-foreground">전체 {parties.length}개</p>
        </div>
        <Button nativeButton={false} render={<Link href="/business/parties/new" />} className="sm:self-start">
          <Plus className="w-4 h-4 mr-2" />
          파티 등록
        </Button>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>파티명</TableHead>
              <TableHead>일시</TableHead>
              <TableHead>장소</TableHead>
              <TableHead className="text-center">정원</TableHead>
              <TableHead className="text-center">신청</TableHead>
              <TableHead>노출</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {parties.map((party) => (
              <TableRow key={party.id}>
                <TableCell className="font-medium text-sm">{party.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {party.date.toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-sm">{party.location}</TableCell>
                <TableCell className="text-sm text-center">
                  {party.currentCount}/{party.maxCapacity}
                </TableCell>
                <TableCell className="text-sm text-center">{party._count.applications}</TableCell>
                <TableCell>
                  {new Date(party.date) < new Date() ? (
                    <Badge variant="outline" className="text-xs text-muted-foreground whitespace-nowrap">
                      기간 만료
                    </Badge>
                  ) : (
                    <PartyVisibilityToggle
                      partyId={party.id}
                      initialVisible={party.isActive}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {party.isActive ? (
                      party.chatRoom ? (
                        <ClosePartyButton
                          partyId={party.id}
                          partyTitle={party.title}
                          isActive={party.isActive}
                          endpoint={`/api/business/parties/${party.id}/close`}
                        />
                      ) : (
                        <StartPartyButton
                          endpoint={`/api/business/parties/${party.id}/start`}
                          partyTitle={party.title}
                        />
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground whitespace-nowrap px-2">
                        종료됨
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      nativeButton={false}
                      render={<Link href={`/business/parties/${party.id}/edit`} />}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
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
