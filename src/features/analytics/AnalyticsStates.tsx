import { AlertCircle, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { AnalyticsDataApiError } from "./analytics-data-api";
import type { AnalyticsDataQualityNotice, AnalyticsQuotaState } from "./types";

export function StatusCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        <CardDescription className="max-w-2xl leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function ConnectionFact({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

export function AnalyticsErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const apiError = error instanceof AnalyticsDataApiError ? error : null;
  const presentation = errorPresentation(apiError);
  return (
    <Card className="border-destructive/30" role="alert" aria-live="assertive">
      <CardContent className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">{presentation.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {presentation.description}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={retry}>
          <RefreshCw /> 다시 시도
        </Button>
      </CardContent>
    </Card>
  );
}

export function errorPresentation(error: AnalyticsDataApiError | null): {
  title: string;
  description: string;
} {
  if (error?.kind === "unknown-field") {
    return {
      title: "GA4에 사용자 식별 측정기준이 아직 없어요",
      description:
        "GA4 맞춤 정의에 사용자 범위 맞춤 측정기준 dopa_uid를 등록하면 조회할 수 있습니다.",
    };
  }
  if (error?.kind === "permission") {
    return {
      title: "GA4 속성 권한이 없습니다.",
      description: "연결한 Google 계정에 이 속성의 Viewer 이상 권한이 있는지 확인해 주세요.",
    };
  }
  if (error?.kind === "quota") {
    const retry = error.retryAfterMs
      ? ` 약 ${Math.ceil(error.retryAfterMs / 1_000)}초 후 다시 시도할 수 있습니다.`
      : " 잠시 후 다시 시도해 주세요.";
    return {
      title: "GA API 할당량을 모두 사용했습니다.",
      description: `데이터를 임의 값으로 대체하지 않았습니다.${retry}`,
    };
  }
  if (error?.kind === "invalid-response" || error?.kind === "request") {
    return {
      title: "보고서 정의를 처리하지 못했습니다.",
      description: "GA4 맞춤 정의와 dimension·metric 호환성을 확인해 주세요.",
    };
  }
  return {
    title: "Google Analytics 보고서를 불러오지 못했습니다.",
    description: "연결 상태를 확인한 뒤 다시 시도해 주세요. 다른 관리자 기능에는 영향을 주지 않습니다.",
  };
}

export function DataQualityPanel({
  notices,
  headingLevel = "h2",
  headingId = "analytics-data-quality-title",
}: {
  notices: AnalyticsDataQualityNotice[];
  /**
   * `AnalyticsDashboard.tsx` renders this as the page's own top-level
   * finding, so it keeps the default `h2`/id pair. `UserBehaviorPanel.tsx`
   * nests it under that page's own `<h2>앱 행동 흐름</h2>`, so it passes
   * `h3` and a distinct id instead of a second, duplicate `h2`.
   */
  headingLevel?: "h2" | "h3";
  headingId?: string;
}) {
  if (notices.length === 0) return null;
  const Heading = headingLevel;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground"
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground">
          <TriangleAlert className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <Heading id={headingId} className="font-semibold">
            데이터 품질 안내
          </Heading>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            GA4가 반환한 보고서별 품질 신호입니다. 아래 제한을 고려해 수치를 해석해 주세요.
          </p>
          <ul className="mt-3 space-y-2">
            {notices.map((notice, index) => (
              <li key={`${notice.reportKey}:${notice.kind}:${index}`} className="leading-6">
                <span className="font-medium">{notice.reportTitle}</span>
                <span className="text-muted-foreground"> · {dataQualityDescription(notice)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function dataQualityDescription(notice: AnalyticsDataQualityNotice): string {
  if (notice.kind === "thresholding") {
    return "개인정보 보호 임계값이 적용되어 소규모 사용자 행이 제외되었을 수 있습니다.";
  }
  if (notice.kind === "other-row") {
    return "고유값이 많은 차원의 일부 값이 (other) 행으로 합쳐졌습니다.";
  }
  const percentage = samplingPercentage(
    notice.samplesReadCount,
    notice.samplingSpaceSize,
  );
  const counts = `${formatIntegerString(notice.samplesReadCount)} / ${formatIntegerString(
    notice.samplingSpaceSize,
  )}개 이벤트`;
  return percentage
    ? `${counts}를 사용한 표본 보고서입니다 (${percentage}).`
    : `${counts}를 사용한 표본 보고서입니다.`;
}

function samplingPercentage(samplesReadCount: string, samplingSpaceSize: string): string | null {
  try {
    const samples = BigInt(samplesReadCount);
    const space = BigInt(samplingSpaceSize);
    if (samples < 0n || space <= 0n) return null;
    const tenthsOfPercent = (samples * 1_000n + space / 2n) / space;
    return `${(Number(tenthsOfPercent) / 10).toFixed(1)}%`;
  } catch {
    return null;
  }
}

function formatIntegerString(value: string): string {
  try {
    return BigInt(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

export function QuotaFooter({ quota }: { quota: AnalyticsQuotaState | null }) {
  if (!quota || quota.entries.length === 0) return null;
  return (
    <details className="rounded-lg border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">GA API 할당량 상태</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {quota.entries.map((entry) => (
          <li key={entry.key} className="flex justify-between gap-3">
            <span>{entry.key}</span>
            <span className="tabular-nums">잔여 {entry.remaining.toLocaleString("ko-KR")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
