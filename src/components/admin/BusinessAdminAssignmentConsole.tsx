"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, RefreshCw, UserRoundCog } from "lucide-react";
import {
  businessQueryKeys,
  listBusinesses,
  type BusinessAdminAssignment,
} from "@/auth/api/admin-business.api";
import { businessDetailPath } from "@/auth/model/admin-routes";
import { BusinessAdminPicker } from "@/components/admin/BusinessAdminPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function BusinessAdminAssignmentConsole() {
  const [businessId, setBusinessId] = useState("");
  const [lastAssignment, setLastAssignment] =
    useState<BusinessAdminAssignment | null>(null);
  const businesses = useQuery({
    queryKey: businessQueryKeys.list({ status: "ACTIVE" }),
    queryFn: () => listBusinesses({ status: "ACTIVE" }),
    retry: 2,
  });
  const selectedBusiness = useMemo(
    () => businesses.data?.find((business) => business.id === businessId),
    [businessId, businesses.data],
  );
  const visibleAssignment =
    lastAssignment &&
    selectedBusiness &&
    lastAssignment.businessId === selectedBusiness.id
      ? lastAssignment
      : null;

  const selectBusiness = (nextBusinessId: string) => {
    setBusinessId(nextBusinessId);
    setLastAssignment(null);
  };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">업체 관리자 배정</h1>
        <p className="text-sm text-muted-foreground">
          가입된 사용자를 이름이나 이메일로 찾아 선택한 업체에 직접 매핑합니다.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Building2 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>1. 업체 선택</CardTitle>
                <CardDescription>
                  관리자를 배정할 활성 업체를 먼저 선택하세요.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {businesses.isPending && (
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            )}

            {businesses.isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">
                  업체 목록을 불러오지 못했습니다.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {businesses.error instanceof Error
                    ? businesses.error.message
                    : "잠시 후 다시 시도해 주세요."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => void businesses.refetch()}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  다시 시도
                </Button>
              </div>
            )}

            {businesses.data?.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                관리자를 배정할 활성 업체가 없습니다.
              </p>
            )}

            {businesses.data && businesses.data.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="business-admin-business">업체</Label>
                <select
                  id="business-admin-business"
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={businessId}
                  onChange={(event) => selectBusiness(event.target.value)}
                >
                  <option value="">업체를 선택하세요</option>
                  {businesses.data.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedBusiness && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{selectedBusiness.name}</p>
                  <Badge variant="outline">{selectedBusiness.kind}</Badge>
                  <Badge>{selectedBusiness.status}</Badge>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  업체 ID: {selectedBusiness.id}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={businessDetailPath(selectedBusiness.id)} />
                  }
                >
                  업체 상세 보기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <UserRoundCog className="size-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>2. 등록 사용자 조회 및 배정</CardTitle>
                <CardDescription>
                  {selectedBusiness
                    ? `${selectedBusiness.name}에 배정할 사용자를 검색하세요.`
                    : "업체를 선택하면 사용자 검색이 활성화됩니다."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedBusiness && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                왼쪽에서 업체를 먼저 선택하세요.
              </p>
            )}

            {selectedBusiness && (
              <>
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                  검색한 사용자는 <strong>{selectedBusiness.name}</strong>에
                  업체 관리자로 배정됩니다.
                </div>
                <BusinessAdminPicker
                  key={selectedBusiness.id}
                  businessId={selectedBusiness.id}
                  businessName={selectedBusiness.name}
                  confirmAssignment
                  onAssigned={setLastAssignment}
                />
              </>
            )}

            {visibleAssignment && (
              <div
                role="status"
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
              >
                <p className="font-medium text-emerald-800">
                  {visibleAssignment.nickname}님을 {visibleAssignment.businessName}{" "}
                  업체 관리자로 배정했습니다.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {visibleAssignment.email ?? "이메일 없음"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
