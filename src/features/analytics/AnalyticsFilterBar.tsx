"use client";

import { FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  togglePlatform,
  type AnalyticsAccountType,
  type AnalyticsFilters,
  type AnalyticsPlatform,
} from "./analytics-filters";

const ACCOUNT_TYPE_OPTIONS: Array<{ value: AnalyticsAccountType; label: string }> = [
  { value: "all", label: "전체" },
  { value: "consumer", label: "일반 사용자" },
  { value: "business", label: "업체" },
];

export type AccountTypeAvailability =
  | "pending"
  | "available"
  | "unavailable"
  | "unknown";

export type AnalyticsFilterBarProps = {
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  platforms: readonly AnalyticsPlatform[];
  accountTypeAvailability: AccountTypeAvailability;
  /** Realtime reports take no dimension filter; the bar says so instead of lying. */
  disabled?: boolean;
};

export function AnalyticsFilterBar({
  filters,
  onChange,
  platforms,
  accountTypeAvailability,
  disabled = false,
}: AnalyticsFilterBarProps) {
  const count = activeFilterCount(filters);
  const accountTypeDisabled =
    disabled || accountTypeAvailability !== "available";

  return (
    <div
      role="group"
      aria-label="보고서 필터"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {platforms.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {platforms.map((platform) => {
            const pressed = filters.platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                onClick={() => onChange(togglePlatform(filters, platform))}
                className={cn(
                  "min-h-9 rounded-lg border px-3 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  pressed && "border-primary bg-accent text-accent-foreground",
                )}
              >
                {platform}
              </button>
            );
          })}
        </div>
      ) : null}

      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        계정 유형
        <select
          aria-label="계정 유형"
          className="h-9 min-w-40 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
          value={filters.accountType}
          disabled={accountTypeDisabled}
          onChange={(event) =>
            onChange({
              ...filters,
              accountType: event.target.value as AnalyticsAccountType,
            })
          }
        >
          {ACCOUNT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        {count > 0 ? (
          <p className="text-xs tabular-nums text-muted-foreground">
            필터 {count}개 적용 중
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || count === 0}
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <FilterX aria-hidden="true" /> 필터 초기화
        </Button>
      </div>

      {/* A disabled control with no reason beside it reads as a broken screen.
          "unknown" is a failed metadata read, not a missing definition: saying
          "register account_type" there would send an operator to GA4 to add a
          dimension the property may well already have. */}
      {accountTypeAvailability === "unavailable" ? (
        <p className="basis-full text-xs leading-5 text-muted-foreground">
          GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.
        </p>
      ) : null}
      {accountTypeAvailability === "unknown" ? (
        <p className="basis-full text-xs leading-5 text-muted-foreground">
          GA4 속성 정보를 읽지 못해 계정 유형 필터를 사용할 수 없습니다.
        </p>
      ) : null}
      {disabled ? (
        <p className="basis-full text-xs leading-5 text-muted-foreground">
          실시간 보고서에는 필터가 적용되지 않습니다.
        </p>
      ) : null}
    </div>
  );
}
