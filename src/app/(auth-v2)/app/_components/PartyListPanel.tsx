"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  listParties,
  partyQueryKeys,
  softCloseParty,
  type AdminParty,
} from "@/auth/api/admin-party.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  /** Effective Nest businessId (already resolved — never raw untrusted URL for BA) */
  businessId: string;
  /** Build edit/detail href for a party */
  partyHref: (partyId: string) => string;
  /** Create form href */
  createHref: string;
  /** Optional back link */
  backHref?: string;
  backLabel?: string;
  title?: string;
  description?: string;
};

/**
 * Shared party list for SUPER_ADMIN (URL scope) and BUSINESS_ADMIN (me scope).
 * Always calls Nest with the provided businessId only.
 */
export function PartyListPanel({
  businessId,
  partyHref,
  createHref,
  backHref,
  backLabel = "← 뒤로",
  title = "파티",
  description,
}: Props) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: partyQueryKeys.list(businessId),
    queryFn: () => listParties(businessId),
    enabled: !!businessId,
  });

  const rows: AdminParty[] = data ?? [];

  const onSoftClose = async (party: AdminParty) => {
    if (!window.confirm(`「${party.title}」을 soft-close 할까요?`)) return;
    try {
      await softCloseParty(party.id);
      toast.success("Soft-close 완료");
      await qc.invalidateQueries({ queryKey: partyQueryKeys.list(businessId) });
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "실패했습니다",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <p className="text-xs text-muted-foreground font-mono break-all mt-1">
            businessId={businessId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backHref && (
            <Button
              nativeButton={false}
              size="sm"
              variant="ghost"
              render={<Link href={backHref} />}
            >
              {backLabel}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            새로고침
          </Button>
          <Button nativeButton={false} size="sm" render={<Link href={createHref} />}>
            <Plus className="w-4 h-4 mr-1" />
            파티 등록
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          {(error as Error)?.message ??
            "목록을 불러오지 못했습니다 (업체가 비활성일 수 있음)"}
        </p>
      )}

      {!isLoading && !isError && (
        <div className="rounded-md border bg-background overflow-x-auto">
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
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    파티가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={partyHref(p.id)}
                      className="font-medium hover:underline"
                    >
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(p.date).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                    {p.location}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {p.currentCount}/{p.maxCapacity}
                  </TableCell>
                  <TableCell>
                    {p.isActive ? (
                      <Badge>ACTIVE</Badge>
                    ) : (
                      <Badge variant="outline">CLOSED</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        nativeButton={false}
                        size="sm"
                        variant="ghost"
                        render={<Link href={partyHref(p.id)} />}
                      >
                        수정
                      </Button>
                      {p.isActive && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void onSoftClose(p)}
                        >
                          Close
                        </Button>
                      )}
                    </div>
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
