"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import {
  businessQueryKeys,
  listBusinesses,
  type AdminBusiness,
} from "@/auth/api/admin-business.api";
import {
  businessDetailPath,
  NestAdminApi,
} from "@/auth/model/admin-routes";
import { BusinessStatusBadge } from "./_components/BusinessStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * PR 2A — SUPER_ADMIN Business list (Nest Auth v2).
 */
export default function AppBusinessesPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <BusinessList />
    </RoleGuard>
  );
}

function BusinessList() {
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: businessQueryKeys.list({ includeDeleted }),
    queryFn: () => listBusinesses({ includeDeleted }),
  });

  const rows: AdminBusiness[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">업체 관리</h1>
          <p className="text-sm text-muted-foreground">
            Nest <code className="text-xs">{NestAdminApi.businesses()}</code>
            {data ? ` · ${rows.length}건` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="rounded border"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            Soft-deleted 포함
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            새로고침
          </Button>
          <Button nativeButton={false} render={<Link href="/app/businesses/new" />}>
            <Plus className="w-4 h-4 mr-2" />
            업체 등록
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? "목록을 불러오지 못했습니다"}
        </p>
      )}

      {!isLoading && !isError && (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>업체명</TableHead>
                <TableHead>종류</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead className="text-center">수수료</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-28"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    업체가 없습니다. 등록 후 초대를 진행하세요.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link
                      href={businessDetailPath(b.id)}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                    {b.tagline && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {b.tagline}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.kind}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.contactEmail ?? b.contactPhone ?? "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm whitespace-nowrap">
                    {(b.feeRateBps / 100).toFixed(
                      b.feeRateBps % 100 === 0 ? 0 : 1,
                    )}
                    %
                  </TableCell>
                  <TableCell>
                    <BusinessStatusBadge
                      status={b.status}
                      deletedAt={b.deletedAt}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      nativeButton={false}
                      size="sm"
                      variant="ghost"
                      render={<Link href={businessDetailPath(b.id)} />}
                    >
                      상세
                    </Button>
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
