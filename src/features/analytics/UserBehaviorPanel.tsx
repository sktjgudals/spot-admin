"use client";

import { useState } from "react";
import {
  BarChart3,
  Clock3,
  Database,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { EVENT_LABELS } from "./analytics-labels";
import {
  AnalyticsErrorState,
  ConnectionFact,
  DataQualityPanel,
  QuotaFooter,
} from "./AnalyticsStates";
import type { AnalyticsPropertyConfig } from "./types";
import { useAnalyticsConnection } from "./use-analytics-connection";
import { useUserBehaviorQuery } from "./use-user-behavior-query";
import {
  formatFlowDay,
  formatFlowMinute,
  pickUserBehaviorProperty,
  type UserBehaviorEvent,
  type UserBehaviorRange,
  type UserBehaviorSession,
} from "./user-behavior-report";

/**
 * 한 사용자의 앱 행동 흐름.
 *
 * 서버 타임라인이 "무슨 일이 기록됐는가"라면 이 패널은 "그때 이 사람 화면에서
 * 무슨 일이 있었는가"다. 결제 실패 21:14 옆에 21:13 /payment가 보여야 조사가
 * 끝난다. 그래서 두 섹션은 같은 화면에서 나란히 스크롤된다.
 *
 * GA 코드는 이 청크에만 있다. 사용자 상세 라우트는 lazy import로만 이 파일에
 * 닿는다.
 */

export type UserBehaviorPanelProps = {
  userId: string;
  nickname: string;
  properties: AnalyticsPropertyConfig[];
  googleClientId: string;
  configError: string | null;
};

const RANGE_OPTIONS: Array<{ value: UserBehaviorRange; label: string }> = [
  { value: "7d", label: "최근 7일" },
  { value: "28d", label: "최근 28일" },
];

export function UserBehaviorPanel({
  userId,
  nickname,
  properties,
  googleClientId,
  configError,
}: UserBehaviorPanelProps) {
  const configured = !configError && properties.length > 0;
  const { token, connecting, connectionError, connect, disconnect } =
    useAnalyticsConnection({ googleClientId, enabled: configured });
  const [propertyId, setPropertyId] = useState(
    () => pickUserBehaviorProperty(properties)?.id ?? "",
  );
  const [range, setRange] = useState<UserBehaviorRange>("7d");
  const selectedProperty =
    properties.find((property) => property.id === propertyId) ??
    pickUserBehaviorProperty(properties);

  if (!configured || !selectedProperty) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-5">
        <div className="flex gap-3">
          <Database className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h3 className="font-medium">GA4 설정 필요</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {configError ??
                "NEXT_PUBLIC_GA4_PROPERTIES에 조회할 GA4 속성을 설정해 주세요."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (token.status !== "connected") {
    const expired = token.status === "expired";
    return (
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex gap-3">
          {expired ? (
            <Clock3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          )}
          <div className="min-w-0">
            <h3 className="font-medium">
              {expired
                ? "Google Analytics 연결이 만료되었습니다."
                : `${nickname} 님의 화면 흐름은 Google Analytics를 연결하면 보입니다`}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              읽기 전용 권한만 요청하고, 토큰은 Dopa 서버로 전송하지 않습니다.
            </p>
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border bg-muted/35 p-4 text-sm sm:grid-cols-3">
          <ConnectionFact title="권한" value="analytics.readonly만 요청" />
          <ConnectionFact title="보관" value="이 탭의 메모리에만 유지 · 로그아웃 시 삭제" />
          <ConnectionFact title="전송" value="Google Data API로 직접 요청" />
        </div>
        {connectionError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {connectionError}
          </p>
        ) : null}
        <Button onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Loader2 className="animate-spin" /> : <Link2 />}
          Google Analytics 연결
        </Button>
      </div>
    );
  }

  return (
    // No `key` here on purpose: the range chip group and property select live
    // inside this same subtree, and useUserBehaviorQuery's queryKey already
    // reacts to property/range/generation changes. Remounting on every range
    // click would replace the very button the operator just pressed, losing
    // its DOM node (and the focus/aria-pressed state on it) mid-click.
    <UserBehaviorFlowView
      property={selectedProperty}
      properties={properties}
      userId={userId}
      range={range}
      generation={token.generation}
      onPropertyChange={setPropertyId}
      onRangeChange={setRange}
      onDisconnect={disconnect}
    />
  );
}

function UserBehaviorFlowView({
  property,
  properties,
  userId,
  range,
  generation,
  onPropertyChange,
  onRangeChange,
  onDisconnect,
}: {
  property: AnalyticsPropertyConfig;
  properties: AnalyticsPropertyConfig[];
  userId: string;
  range: UserBehaviorRange;
  generation: number;
  onPropertyChange: (propertyId: string) => void;
  onRangeChange: (range: UserBehaviorRange) => void;
  onDisconnect: () => void;
}) {
  const query = useUserBehaviorQuery({ property, userId, range, generation });
  const apiError = query.error instanceof AnalyticsDataApiError ? query.error : null;

  let content: React.ReactNode;
  if (query.isPending) {
    content = <BehaviorSkeleton />;
  } else if (query.isError) {
    content =
      apiError?.kind === "unknown-field" ? (
        <DimensionMissingState apiMessage={apiError.apiMessage} />
      ) : (
        <AnalyticsErrorState error={query.error} retry={() => void query.refetch()} />
      );
  } else if (query.data.isEmpty) {
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={query.data.dataQualityNotices} />
        <BehaviorEmptyState
          thresholded={query.data.dataQualityNotices.some(
            (notice) => notice.kind === "thresholding",
          )}
        />
        <QuotaFooter quota={query.data.quota} />
      </div>
    );
  } else {
    const flow = query.data;
    content = (
      <div className="space-y-4">
        <DataQualityPanel notices={flow.dataQualityNotices} />
        <dl className="grid grid-cols-3 gap-3 rounded-xl border bg-card p-4">
          <BehaviorTotal label="세션" value={flow.totals.sessions} />
          <BehaviorTotal label="이벤트" value={flow.totals.events} />
          <BehaviorTotal label="화면 조회" value={flow.totals.screenViews} />
        </dl>
        {flow.truncated ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            이벤트가 많아 최근 일부만 표시했습니다. 기간을 좁혀 다시 조회해 주세요.
          </p>
        ) : null}
        {flow.sessions.map((session) => (
          <BehaviorSessionCard key={session.id} session={session} />
        ))}
        <QuotaFooter quota={flow.quota} />
        <p className="text-xs leading-5 text-muted-foreground">
          {flow.timeZone} 기준, GA4 처리 지연으로 최근 24–48시간은 누락될 수 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {properties.length > 1 ? (
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              GA4 속성
              <select
                className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
                value={property.id}
                onChange={(event) => onPropertyChange(event.target.value)}
              >
                {properties.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div
            role="group"
            aria-label="행동 조회 기간"
            className="flex gap-1 rounded-lg border bg-muted/40 p-1"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                className={cn(
                  "min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  range === option.value && "bg-background text-foreground shadow-sm",
                )}
                onClick={() => onRangeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : undefined} />
            새로고침
          </Button>
          <Button variant="ghost" size="sm" onClick={onDisconnect}>
            <Unplug /> 연결 끊기
          </Button>
        </div>
      </div>
      {!query.isError ? (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={query.isPending ? "true" : undefined}
        >
          {query.isPending
            ? "사용자 행동 흐름을 불러오는 중입니다."
            : `세션 ${query.data?.totals.sessions ?? 0}개를 불러왔습니다.`}
        </p>
      ) : null}
      {content}
    </div>
  );
}

function BehaviorTotal({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">
        {value.toLocaleString("ko-KR")}
      </dd>
    </div>
  );
}

function BehaviorSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * GA4에 dopa_uid 맞춤 측정기준이 없을 때.
 *
 * 이건 오류가 아니라 아직 하지 않은 설정이다. "다시 시도"를 눌러도 달라지지
 * 않으므로 재시도 버튼 대신 해야 할 일을 순서대로 적는다.
 *
 * 안내 목록은 일부러 "dopa_uid"를 문자 그대로 적지 않는다. GA4의 원문 오류
 * 메시지(apiMessage)가 이미 그 이름을 담고 있어서, 목록에도 반복하면 화면에
 * 같은 식별자가 여러 곳에 흩어져 운영자가 "이 중 어느 dopa_uid를 보라는
 * 건지" 헷갈린다. 정확한 이름은 아래 원문 한 곳에서만 확인한다.
 */
function DimensionMissingState({ apiMessage }: { apiMessage?: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm"
    >
      <div className="flex gap-3">
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0 text-warning-foreground"
          aria-hidden
        />
        <div className="min-w-0 space-y-2">
          <h3 className="font-medium">GA4에 사용자 식별 측정기준이 아직 없어요</h3>
          <ol className="list-decimal space-y-1 pl-5 leading-6 text-muted-foreground">
            <li>GA4 관리 → 맞춤 정의 → 맞춤 측정기준 만들기</li>
            <li>범위는 사용자로 선택</li>
            <li>사용자 속성 이름은 앱이 로그인할 때 보내는 것과 동일하게 지정</li>
            <li>등록한 이후에 수집된 이벤트부터 조회할 수 있습니다</li>
          </ol>
          {apiMessage ? (
            <p className="text-xs leading-5 text-muted-foreground">{apiMessage}</p>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              맞춤 측정기준 이름은 dopa_uid입니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BehaviorEmptyState({ thresholded }: { thresholded: boolean }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
      <BarChart3 className="mx-auto size-5 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">아직 수집된 행동이 없어요</p>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
        {thresholded
          ? "임계값 때문에 표시되지 않을 수 있어요. 위 데이터 품질 안내를 함께 확인해 주세요."
          : "dopa_uid가 등록된 이후 이 사용자가 앱을 사용하면 흐름이 여기에 표시됩니다."}
      </p>
    </div>
  );
}

function mergeVisitEvents(
  events: readonly UserBehaviorEvent[],
): Array<{ name: string; count: number }> {
  const merged = new Map<string, number>();
  for (const event of events) {
    merged.set(event.name, (merged.get(event.name) ?? 0) + event.count);
  }
  return [...merged].map(([name, count]) => ({ name, count }));
}

function BehaviorSessionCard({ session }: { session: UserBehaviorSession }) {
  const dayLabel = formatFlowDay(session.day);
  const start = formatFlowMinute(session.startMinute);
  const end = formatFlowMinute(session.endMinute);
  return (
    <section className="rounded-xl border bg-card" aria-label={`${dayLabel} ${start} 세션`}>
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <span className="font-medium tabular-nums">{dayLabel}</span>
        <span className="tabular-nums text-muted-foreground">{`${start}–${end}`}</span>
        <span className="text-muted-foreground">지속 {session.durationMinutes}분</span>
        <Badge variant="outline">{session.platform}</Badge>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {session.eventCount.toLocaleString("ko-KR")} 이벤트
        </span>
      </header>
      <ol className="divide-y">
        {session.screens.map((visit, index) => (
          <li
            key={`${session.id}:${visit.startMinute}:${index}`}
            className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-24">
              {`${formatFlowMinute(visit.startMinute)}–${formatFlowMinute(visit.endMinute)}`}
            </p>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{visit.screen}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {mergeVisitEvents(visit.events).map((event) => (
                  <Badge key={event.name} variant="outline" className="font-normal">
                    {`${EVENT_LABELS[event.name] ?? event.name} × ${event.count}`}
                  </Badge>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
