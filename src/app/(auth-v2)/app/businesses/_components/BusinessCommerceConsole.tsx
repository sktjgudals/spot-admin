"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  activateBusinessCommerce,
  businessQueryKeys,
  getBusinessCommerce,
  pauseBusinessCommerce,
  updateBusinessCommerce,
  type BusinessCommerceOverview,
  type CommercePaymentMode,
  type CommerceRuntimeMode,
  type CommerceSalesModel,
  type UpdateBusinessCommerceInput,
} from "@/auth/api/admin-business.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CommerceDraft = {
  paymentMode: CommercePaymentMode;
  salesModel: CommerceSalesModel;
  maxAmount: number;
  salesUrl: string;
  refundUrl: string;
};

const emptyDraft: CommerceDraft = {
  paymentMode: "TEST",
  salesModel: "DIRECT",
  maxAmount: 29_000,
  salesUrl: "",
  refundUrl: "",
};

const requirementLabels: Record<string, string> = {
  COMMERCE_PROFILE_MISSING: "결제 프로필 저장",
  BUSINESS_NOT_ACTIVE: "업체 활성 상태",
  BUSINESS_DISCLOSURE_INCOMPLETE: "사업자·연락처·주소 공개 정보",
  REFUND_POLICY_NOT_PUBLISHED: "환불 정책 게시",
  SALES_URL_MISSING: "공개 판매 URL",
  REFUND_URL_MISSING: "공개 환불 URL",
  PAYOUT_SELLER_NOT_APPROVED: "토스 지급대행 셀러 승인",
  PAYOUT_ACCOUNT_NOT_READY: "정산 계좌 확인",
  TOSS_KEYS_INVALID: "토스 PG 키 쌍",
  TOSS_KEYS_MISSING_OR_INVALID: "토스 PG 키 쌍",
  TOSS_KEY_MODE_MISMATCH: "토스 PG 테스트·라이브 키 모드 일치",
  TOSS_KEY_FAMILY_MISMATCH: "토스 PG 키 제품군 일치",
  TOSS_KEY_ENVIRONMENT_MISMATCH: "배포 환경과 PG 키 모드 일치",
  HOST_PAYMENT_MODE_MISMATCH: "호스트와 PG 키 모드 일치",
  TOSS_MID_MISMATCH: "토스 계약 MID",
  TOSS_CONTRACT_LIMIT_INVALID: "토스 계약 결제 한도",
  DIRECT_SALES_BUSINESS_MISMATCH: "직접판매 계약 업체",
  PAYOUT_RUNTIME_NOT_READY: "지급대행 키·계약 준비",
};

function applyOverview(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string,
  overview: BusinessCommerceOverview,
) {
  queryClient.setQueryData(businessQueryKeys.commerce(businessId), overview);
}

function errorMessage(error: Error): string {
  return error instanceof AdminAuthError
    ? error.message
    : error.message || "결제 운영 설정을 처리하지 못했습니다.";
}

function runtimeModeLabel(mode: CommerceRuntimeMode | null): string {
  if (mode === null) return "확인 불가";
  if (mode === "DISABLED") return "준비 안 됨 (DISABLED)";
  return mode;
}

export function BusinessCommerceConsole({
  businessId,
}: {
  businessId: string;
}) {
  const queryClient = useQueryClient();
  const [pauseReason, setPauseReason] = useState("");
  const commerce = useQuery({
    queryKey: businessQueryKeys.commerce(businessId),
    queryFn: () => getBusinessCommerce(businessId),
    enabled: businessId.length > 0,
  });

  const saveDraft = useMutation({
    mutationFn: async (input: UpdateBusinessCommerceInput) => {
      if (!Number.isSafeInteger(input.maxAmount) || input.maxAmount <= 0) {
        throw new Error("호스트 최대 결제금액을 확인해 주세요.");
      }
      return updateBusinessCommerce(businessId, input);
    },
    onSuccess: (overview) => {
      applyOverview(queryClient, businessId, overview);
      toast.success("결제 운영 설정을 초안으로 저장했습니다.");
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  });

  const activate = useMutation({
    mutationFn: () => activateBusinessCommerce(businessId),
    onSuccess: (overview) => {
      applyOverview(queryClient, businessId, overview);
      toast.success(
        overview.runtime.newPaymentsEnabled
          ? "이 호스트의 결제 운영 프로필을 활성화했습니다."
          : "호스트 프로필을 활성화했습니다. 신규 결제 전역 스위치는 OFF입니다.",
      );
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  });

  const pause = useMutation({
    mutationFn: () => pauseBusinessCommerce(businessId, pauseReason.trim()),
    onSuccess: (overview) => {
      applyOverview(queryClient, businessId, overview);
      setPauseReason("");
      toast.success("이 호스트의 신규 결제를 중지했습니다.");
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  });

  const activationBlockers = useMemo(() => {
    const data = commerce.data;
    if (!data?.profile) return ["COMMERCE_PROFILE_MISSING"];
    if (data.activationBlockers) return data.activationBlockers;
    // Rolling deploy fallback for an older Worker response.
    const blockers = [...data.missingRequirements];
    if (!data.runtime.paymentKeysValid) {
      blockers.push(data.runtime.paymentKeyReasonCode ?? "TOSS_KEYS_INVALID");
    }
    if (data.runtime.paymentMode !== data.profile.paymentMode) {
      blockers.push("HOST_PAYMENT_MODE_MISMATCH");
    }
    if (data.runtime.contractMaxAmount === null) {
      blockers.push("TOSS_CONTRACT_LIMIT_INVALID");
    }
    if (
      data.profile.salesModel === "PAYOUT_AGENCY" &&
      data.runtime.payoutMode !== data.profile.paymentMode
    ) {
      blockers.push("PAYOUT_RUNTIME_NOT_READY");
    }
    return [...new Set(blockers)];
  }, [commerce.data]);

  if (commerce.isPending) {
    return <div className="h-40 animate-pulse rounded-md bg-muted" />;
  }

  if (commerce.isError || !commerce.data) {
    return (
      <div className="space-y-3 rounded-md border border-destructive/30 p-4">
        <p className="text-sm text-destructive">
          {commerce.error instanceof Error
            ? commerce.error.message
            : "결제 운영 상태를 불러오지 못했습니다."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void commerce.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    );
  }

  const { profile, readiness, runtime } = commerce.data;
  const draft: CommerceDraft = profile
    ? {
        paymentMode: profile.paymentMode,
        salesModel: profile.salesModel,
        maxAmount: profile.maxAmount,
        salesUrl: profile.salesUrl,
        refundUrl: profile.refundUrl,
      }
    : {
        ...emptyDraft,
        paymentMode: runtime.paymentMode ?? emptyDraft.paymentMode,
      };
  const isPending =
    saveDraft.isPending || activate.isPending || pause.isPending;
  const effectiveLimit = Math.min(
    runtime.contractMaxAmount ?? 0,
    profile?.maxAmount ?? draft.maxAmount,
  );
  const readinessItems: ReadonlyArray<readonly [string, boolean]> = [
    ["업체 활성 상태", readiness.businessActive],
    ["사업자·연락처·주소 공개 정보", readiness.businessDisclosureComplete],
    ["환불 정책 게시", readiness.refundPolicyPublished],
    ...((profile?.salesModel ?? draft.salesModel) === "PAYOUT_AGENCY"
      ? ([
          ["토스 지급대행 셀러 승인", readiness.payoutSellerApproved],
          ["정산 계좌 확인", readiness.payoutAccountReady],
        ] as const)
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={profile?.status === "ACTIVE" ? "default" : "outline"}>
          호스트 프로필 {profile?.status ?? "미설정"}
        </Badge>
        <Badge variant="secondary">{runtime.environment}</Badge>
        <span className="text-xs text-muted-foreground">
          신규 결제 스위치 {runtime.newPaymentsEnabled ? "ON" : "OFF"} · 외부
          호스트 {runtime.externalHostPaymentsEnabled ? "ON" : "OFF"}
        </span>
      </div>

      {profile?.status === "ACTIVE" && !runtime.newPaymentsEnabled && (
        <div
          className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground"
          role="status"
        >
          호스트 프로필은 활성화됐지만 신규 결제 전역 스위치가 OFF라 고객
          결제는 시작되지 않습니다.
        </div>
      )}

      <div className="grid gap-3 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-2">
        <RuntimeField
          label="PG 키 모드"
          value={runtimeModeLabel(runtime.paymentMode)}
        />
        <RuntimeField
          label="PG 키 쌍"
          value={
            runtime.paymentKeysValid
              ? "정상"
              : (runtime.paymentKeyReasonCode ?? "오류")
          }
        />
        <RuntimeField
          label="지급대행 모드"
          value={runtimeModeLabel(runtime.payoutMode)}
        />
        <RuntimeField
          label="계약 한도"
          value={
            runtime.contractMaxAmount === null
              ? "확인 불가"
              : `${runtime.contractMaxAmount.toLocaleString("ko-KR")}원`
          }
        />
        <RuntimeField
          label="현재 유효 한도"
          value={`${effectiveLimit.toLocaleString("ko-KR")}원`}
        />
        <RuntimeField
          label="장기 미해결 지급"
          value={
            readiness.oldestUnresolvedPayoutAt === null
              ? "없음"
              : new Date(readiness.oldestUnresolvedPayoutAt).toLocaleString(
                  "ko-KR",
                )
          }
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold">호스트 자격 체크리스트</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {readinessItems.map(([label, ready]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              {ready ? (
                <CheckCircle2
                  className="size-4 text-success"
                  aria-hidden="true"
                />
              ) : (
                <CircleAlert
                  className="size-4 text-destructive"
                  aria-hidden="true"
                />
              )}
              <span>{label}</span>
            </div>
          ))}
        </div>
        {activationBlockers.length > 0 && (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-warning-foreground">
            <p className="text-sm font-medium">활성화 전 확인 필요</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {activationBlockers.map((code) => (
                <li key={code}>{requirementLabels[code] ?? code}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form
        key={
          profile?.updatedAt ??
          `${runtime.environment}-${runtime.paymentMode ?? "unknown"}`
        }
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveDraft.mutate({
            paymentMode: String(form.get("paymentMode")) as CommercePaymentMode,
            salesModel: String(form.get("salesModel")) as CommerceSalesModel,
            maxAmount: Number(form.get("maxAmount")),
            salesUrl: String(form.get("salesUrl")),
            refundUrl: String(form.get("refundUrl")),
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="commerce-payment-mode">결제 키 모드</Label>
          <select
            id="commerce-payment-mode"
            name="paymentMode"
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue={draft.paymentMode}
          >
            <option value="TEST">TEST</option>
            <option value="LIVE">LIVE</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commerce-sales-model">판매·정산 방식</Label>
          <select
            id="commerce-sales-model"
            name="salesModel"
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue={draft.salesModel}
          >
            <option value="DIRECT">직접 판매</option>
            <option value="PAYOUT_AGENCY">지급대행</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commerce-max-amount">호스트 최대 결제금액</Label>
          <Input
            id="commerce-max-amount"
            name="maxAmount"
            type="number"
            min={1}
            max={999_999_999}
            defaultValue={draft.maxAmount}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="commerce-sales-url">공개 판매 URL</Label>
          <Input
            id="commerce-sales-url"
            name="salesUrl"
            type="url"
            inputMode="url"
            defaultValue={draft.salesUrl}
            placeholder="https://…"
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="commerce-refund-url">공개 환불 URL</Label>
          <Input
            id="commerce-refund-url"
            name="refundUrl"
            type="url"
            inputMode="url"
            defaultValue={draft.refundUrl}
            placeholder="https://…"
            required
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" variant="outline" disabled={isPending}>
            {saveDraft.isPending ? "저장 중…" : "초안 저장"}
          </Button>
          <Button
            type="button"
            disabled={
              isPending ||
              activationBlockers.length > 0 ||
              profile?.status === "ACTIVE"
            }
            onClick={() => {
              if (
                window.confirm(
                  "확인된 자격과 계약 범위로 이 호스트의 결제 운영 프로필을 활성화할까요? 전역 결제 스위치는 별도로 관리됩니다.",
                )
              ) {
                activate.mutate();
              }
            }}
          >
            {activate.isPending ? "활성화 중…" : "호스트 프로필 활성화"}
          </Button>
        </div>
      </form>

      {profile && (
        <div className="space-y-2 rounded-md border border-destructive/20 p-4">
          <Label htmlFor="commerce-pause-reason">신규 결제 중지 사유</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="commerce-pause-reason"
              value={pauseReason}
              onChange={(event) => setPauseReason(event.target.value)}
              maxLength={1_000}
              placeholder="고객과 운영자에게 추적 가능한 실제 사유"
            />
            <Button
              type="button"
              variant="destructive"
              disabled={
                isPending ||
                pauseReason.trim().length === 0 ||
                profile.status === "PAUSED"
              }
              onClick={() => {
                if (
                  window.confirm("이 호스트의 신규 결제를 즉시 중지할까요?")
                ) {
                  pause.mutate();
                }
              }}
            >
              {pause.isPending ? "중지 중…" : "신규 결제 중지"}
            </Button>
          </div>
          {profile.pauseReason && (
            <p className="text-xs text-muted-foreground">
              현재 중지 사유: {profile.pauseReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RuntimeField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-all font-medium">{value}</p>
    </div>
  );
}
