"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import {
  businessQueryKeys,
  getBusiness,
} from "@/auth/api/admin-business.api";
import {
  businessInvitationsPath,
  businessPartiesPath,
  NestAdminApi,
} from "@/auth/model/admin-routes";
import { BusinessStatusBadge } from "../_components/BusinessStatusBadge";
import { BusinessLifecycleActions } from "../_components/BusinessLifecycleActions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * PR 2A — SUPER_ADMIN business detail + lifecycle.
 * Scope: businessId from URL only.
 */
export default function BusinessDetailPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <BusinessDetail />
    </RoleGuard>
  );
}

function BusinessDetail() {
  const params = useParams();
  const businessId = String(params.businessId ?? "");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: businessQueryKeys.detail(businessId),
    queryFn: () => getBusiness(businessId, { includeDeleted: true }),
    enabled: !!businessId,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? "업체를 찾을 수 없습니다"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{data.name}</h1>
          <p className="text-xs text-muted-foreground font-mono break-all">
            {data.id}
          </p>
        </div>
        <BusinessStatusBadge status={data.status} deletedAt={data.deletedAt} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
          <CardDescription>
            <code className="text-xs">{NestAdminApi.business(data.id)}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Field label="종류" value={data.kind} />
          <Field
            label="수수료"
            value={`${(data.feeRateBps / 100).toFixed(data.feeRateBps % 100 === 0 ? 0 : 1)}% (${data.feeRateBps} bps)`}
          />
          <Field label="이메일" value={data.contactEmail ?? "—"} />
          <Field label="전화" value={data.contactPhone ?? "—"} />
          <Field label="사업자번호" value={data.businessNumber ?? "—"} />
          <Field label="주소" value={data.address ?? "—"} />
          <div className="sm:col-span-2">
            <Field label="한줄 소개" value={data.tagline ?? "—"} />
          </div>
          <div className="sm:col-span-2">
            <Field label="소개" value={data.description ?? "—"} />
          </div>
          <Field
            label="생성"
            value={new Date(data.createdAt).toLocaleString()}
          />
          <Field
            label="수정"
            value={new Date(data.updatedAt).toLocaleString()}
          />
          {data.deletedAt && (
            <Field
              label="삭제"
              value={new Date(data.deletedAt).toLocaleString()}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">라이프사이클</CardTitle>
          <CardDescription>
            Disable = 운영 중지 · Soft-delete = tombstone + 세션 폐기 · Restore =
            복구 승인(ACTIVE)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessLifecycleActions business={data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">하위 기능</CardTitle>
          <CardDescription>
            Party URL은 항상 businessId를 path에 포함합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link href={businessPartiesPath(data.id)} />}
          >
            파티
          </Button>
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link href={businessInvitationsPath(data.id)} />}
          >
            초대
          </Button>
          <Button
            nativeButton={false}
            size="sm"
            variant="ghost"
            render={<Link href="/app/businesses" />}
          >
            ← 목록
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}
