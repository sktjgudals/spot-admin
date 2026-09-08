"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  isAdminForbidden,
  isAdminNotFound,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/auth/api/admin-users.api";
import {
  mutateAdminResource,
  type AdminResource,
} from "@/auth/api/admin-resources.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { ROUTE_SUPER_ADMIN_USERS } from "@/auth/model/admin-routes";
import { usersConfig } from "@/components/admin/resource-configs/users";
import {
  ResourceActionDialog,
  type PendingResourceAction,
} from "@/components/admin/resource-console/ResourceActionDialog";
import { createRetryableLazyComponent } from "@/components/performance/RetryableLazyComponent";
import { Button } from "@/components/ui/button";
import type { AnalyticsPropertyConfig } from "@/features/analytics/types";
import type { UserBehaviorPanelProps } from "@/features/analytics/UserBehaviorPanel";
import { UserDetailHeader } from "./UserDetailHeader";
import { UserFlowTimeline } from "./UserFlowTimeline";
import { useUserDetailQuery, useUserSummaryQuery } from "./use-user-detail-query";

/**
 * 한 사용자, 한 화면.
 *
 * 서버 활동 타임라인과 GA 화면 흐름을 좌우로 나란히 둔다. "결제 실패 21:14"와
 * "21:13 /payment"를 같은 스크롤에서 볼 수 있어야 조사가 끝나기 때문에 탭으로
 * 나누지 않았다.
 *
 * GA 코드는 lazy 청크로만 들어온다. 이 파일이 GA Data API 클라이언트 모듈이나
 * Google 애널리틱스 OAuth 모듈을 정적으로 import하면 릴리스 계약 테스트가 막는다.
 */

function UserBehaviorSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

const LazyUserBehaviorPanel = createRetryableLazyComponent<UserBehaviorPanelProps>(
  () =>
    import("@/features/analytics/UserBehaviorPanel").then((module) => ({
      default: module.UserBehaviorPanel,
    })),
  {
    loading: <UserBehaviorSkeleton />,
    errorTitle: "행동 분석 모듈을 불러오지 못했습니다.",
  },
);

export type UserDetailPageProps = {
  userId: string;
  analytics: {
    properties: AnalyticsPropertyConfig[];
    googleClientId: string;
    configError: string | null;
  };
};

function detailFromSummary(
  userId: string,
  summary: AdminUserSummary,
): AdminUserDetail {
  return {
    id: summary.profile.id || userId,
    email: summary.profile.email,
    nickname: summary.profile.nickname,
    profileImage: summary.profile.profileImage,
    provider: null,
    // The summary route never carries a role. "USER" here used to read as
    // a real fact about the account; an empty string is guarded out of the
    // header instead of standing in for data this route does not have.
    role: "",
    status: summary.profile.status,
    averageRating: null,
    createdAt: summary.profile.createdAt,
    updatedAt: null,
    assignedBusinessId: null,
    // Unknown, not "confirmed not blocked" — `false` would have quietly
    // cleared a real "로그인 제한" fact this reconstruction cannot see.
    blocked: null,
    asOf: summary.asOf || null,
    summary,
  };
}

export function UserDetailPage({ userId, analytics }: UserDetailPageProps) {
  const queryClient = useQueryClient();
  const detailQuery = useUserDetailQuery(userId);
  const detailMissing = isAdminNotFound(detailQuery.error);
  // The detail route may inline the summary. Only ask the dedicated route once
  // the detail has settled and did not carry one — or when the detail 404s,
  // which is how a withdrawn account looks. Enabling this on the first render
  // would fire a second request for every user whose detail inlines a summary.
  const summaryQuery = useUserSummaryQuery(userId, {
    enabled: (detailQuery.isSuccess && !detailQuery.data.summary) || detailMissing,
  });
  const [pending, setPending] = useState<PendingResourceAction | null>(null);

  const mutation = useMutation({
    mutationFn: (input: {
      path: string;
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: Record<string, unknown>;
    }) => mutateAdminResource(input.path, input.method, input.body),
    onSuccess: () => {
      toast.success("처리되었습니다.");
      setPending(null);
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.detail(userId),
      });
      // The list console caches under its own prefix; leaving it stale would
      // show "정상" next to an account this screen just suspended.
      void queryClient.invalidateQueries({ queryKey: ["admin-v2", "users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "처리하지 못했습니다."),
  });

  const summary = detailQuery.data?.summary ?? summaryQuery.data ?? null;
  const user =
    detailQuery.data ??
    (detailMissing && summary ? detailFromSummary(userId, summary) : null);

  if (!user && (detailQuery.isPending || (detailMissing && summaryQuery.isPending))) {
    return <UserDetailSkeleton />;
  }

  if (!user) {
    if (isAdminForbidden(detailQuery.error)) {
      return (
        <UserDetailNotice
          title="이 계정을 볼 권한이 없습니다."
          description="SUPER_ADMIN 권한이 있는 계정으로 다시 로그인해 주세요."
        />
      );
    }
    if (detailMissing) {
      return (
        <UserDetailNotice
          title="사용자를 찾을 수 없습니다"
          description="삭제되었거나 주소가 잘못되었습니다."
        />
      );
    }
    return (
      <UserDetailNotice
        title="사용자 정보를 불러오지 못했습니다."
        description={
          detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "잠시 후 다시 시도해 주세요."
        }
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  // A withdrawn account is gone, not merely suspended: banning or unbanning
  // it is not a real operation, so its actions never reach the header.
  const withdrawn = detailMissing || Boolean(summary?.profile.deletedAt);

  const actionRow: AdminResource = {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };

  const actions = (usersConfig.actions ?? [])
    .filter((action) => !action.hidden?.(actionRow))
    .map((action) => (
      <Button
        key={action.label}
        size="sm"
        variant={action.destructive ? "destructive" : "outline"}
        disabled={mutation.isPending}
        onClick={() => {
          mutation.reset();
          setPending({ action, row: actionRow, reason: "", amount: "" });
        }}
      >
        {action.label}
      </Button>
    ));

  const submitAction = () => {
    if (!pending) return;
    const body = pending.action.body?.(pending.row, {});
    if (body === null) return;
    mutation.mutate({
      path: pending.action.path(pending.row),
      method: pending.action.method ?? "POST",
      ...(body === undefined ? {} : { body }),
    });
  };

  return (
    <div className="space-y-6">
      <UserDetailHeader
        user={user}
        summary={summary}
        summaryPending={summaryQuery.isPending && summaryQuery.fetchStatus !== "idle"}
        withdrawn={withdrawn}
        actions={withdrawn ? [] : actions}
      />

      <nav aria-label="사용자 상세 섹션" className="flex gap-2 xl:hidden">
        <a
          href="#flow"
          className="rounded-lg border px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          활동 플로우
        </a>
        <a
          href="#behavior"
          className="rounded-lg border px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          앱 행동 흐름
        </a>
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section id="flow" aria-labelledby="user-flow-title" className="min-w-0 space-y-3">
          <h2 id="user-flow-title" className="text-lg font-semibold tracking-tight">
            활동 플로우
          </h2>
          <UserFlowTimeline userId={userId} />
        </section>
        <section
          id="behavior"
          aria-labelledby="user-behavior-title"
          className="min-w-0 space-y-3"
        >
          <h2 id="user-behavior-title" className="text-lg font-semibold tracking-tight">
            앱 행동 흐름
          </h2>
          <LazyUserBehaviorPanel
            userId={userId}
            nickname={user.nickname}
            properties={analytics.properties}
            googleClientId={analytics.googleClientId}
            configError={analytics.configError}
          />
        </section>
      </div>

      <ResourceActionDialog
        config={usersConfig}
        pending={pending}
        isPending={mutation.isPending}
        confirmDisabled={mutation.isPending}
        error={mutation.error instanceof Error ? mutation.error : null}
        onReasonChange={(reason) =>
          setPending((current) => (current ? { ...current, reason } : current))
        }
        onAmountChange={(amount) =>
          setPending((current) => (current ? { ...current, amount } : current))
        }
        onSubmit={submitAction}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

function UserDetailNotice({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <Link
        href={ROUTE_SUPER_ADMIN_USERS}
        prefetch={false}
        className="inline-block rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← 사용자 목록
      </Link>
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6"
      >
        <p className="font-medium text-destructive">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {onRetry ? (
          <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
            다시 시도
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UserDetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex gap-4 border-b pb-5">
        <div className="size-10 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    </div>
  );
}
