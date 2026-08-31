"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  listParties,
  partyQueryKeys,
  type AdminParty,
} from "@/auth/api/admin-party.api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format-date";
import { PartyStatusBadge } from "./PartyStatusBadge";

type DesktopPartyListPanelProps = {
  businessId: string;
  partyHref: (partyId: string) => string;
  createHref: string;
  backHref?: string;
  backLabel?: string;
  title?: string;
  description?: string;
};

/** SUPER_ADMIN-only table. No operator cursor, image, or mobile chrome dependencies. */
export function DesktopPartyListPanel({
  businessId,
  partyHref,
  createHref,
  backHref,
  backLabel = "← 뒤로",
  title = "파티",
  description,
}: DesktopPartyListPanelProps) {
  const parties = useQuery({
    queryKey: partyQueryKeys.list(businessId, "super"),
    queryFn: () => listParties(businessId, "super"),
    enabled: businessId.length > 0,
  });
  const rows: AdminParty[] = parties.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            businessId={businessId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backHref ? (
            <Button
              nativeButton={false}
              size="sm"
              variant="ghost"
              render={<Link href={backHref} />}
            >
              {backLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={parties.isFetching}
            onClick={() => void parties.refetch()}
          >
            새로고침
          </Button>
          <Button
            nativeButton={false}
            size="sm"
            render={<Link href={createHref} />}
          >
            <Plus className="mr-1 size-4" aria-hidden />
            파티 등록
          </Button>
        </div>
      </div>

      {parties.isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          불러오는 중…
        </p>
      ) : null}
      {parties.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {parties.error?.message ??
            "목록을 불러오지 못했습니다 (업체가 비활성일 수 있음)"}
        </p>
      ) : null}
      {!parties.isLoading && !parties.isError && rows.length >= 100 ? (
        <p
          role="alert"
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          현재 API가 반환하는 최대 100개만 표시합니다. 이 업체에 파티가 더
          있다면 일부가 보이지 않을 수 있습니다.
        </p>
      ) : null}

      {!parties.isLoading && !parties.isError ? (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>일시</TableHead>
                <TableHead>장소</TableHead>
                <TableHead className="text-center">정원</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-36"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    파티가 없습니다.
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((party) => (
                <TableRow key={party.id}>
                  <TableCell>
                    <Link
                      href={partyHref(party.id)}
                      className="font-medium hover:underline"
                    >
                      {party.title}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(party.date)}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                    {party.location}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {party.currentCount}/{party.maxCapacity}
                  </TableCell>
                  <TableCell>
                    <PartyStatusBadge status={party.operationalStatus} />
                  </TableCell>
                  <TableCell>
                    <Button
                      nativeButton={false}
                      size="sm"
                      variant="ghost"
                      render={<Link href={partyHref(party.id)} />}
                    >
                      수정
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
