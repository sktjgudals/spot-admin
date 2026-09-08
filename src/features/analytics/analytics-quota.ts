import type { AnalyticsQuotaCategory, AnalyticsQuotaState } from "./types";

/**
 * GA4 bills Core, Realtime and Funnel from separate token pools. Naming the
 * pool matters: "할당량 소진" on the funnel tab does not mean the tables are
 * unavailable, and an operator who assumes it does stops investigating.
 */
export const QUOTA_POOL_LABELS: Record<AnalyticsQuotaCategory, string> = {
  core: "Core",
  realtime: "실시간",
  funnel: "퍼널(별도 풀)",
};

export const QUOTA_LOW_RATIO = 0.1;

const HOUR_KEYS = ["tokensPerHour", "tokensPerProjectPerHour"] as const;
const DAY_KEYS = ["tokensPerDay"] as const;

export type AnalyticsQuotaPressure = {
  level: "ok" | "low" | "exhausted";
  scope: "hour" | "day" | null;
  key: string | null;
  ratio: number | null;
};

const OK: AnalyticsQuotaPressure = {
  level: "ok",
  scope: null,
  key: null,
  ratio: null,
};

export function quotaPressure(
  quota: AnalyticsQuotaState | null,
): AnalyticsQuotaPressure {
  if (!quota) return OK;

  let worst: AnalyticsQuotaPressure = OK;
  for (const entry of quota.entries) {
    const scope = (HOUR_KEYS as readonly string[]).includes(entry.key)
      ? ("hour" as const)
      : (DAY_KEYS as readonly string[]).includes(entry.key)
        ? ("day" as const)
        : null;
    if (scope === null) continue;

    const total = entry.consumed + entry.remaining;
    if (total <= 0) continue;
    const ratio = entry.remaining / total;
    const level =
      entry.remaining === 0
        ? ("exhausted" as const)
        : ratio < QUOTA_LOW_RATIO
          ? ("low" as const)
          : ("ok" as const);
    if (level === "ok") continue;

    const candidate: AnalyticsQuotaPressure = { level, scope, key: entry.key, ratio };
    // Exhausted beats low; at the same level the hourly pool is the one an
    // operator can wait out, so name it first.
    if (
      worst.level === "ok" ||
      (worst.level === "low" && level === "exhausted") ||
      (worst.level === level && scope === "hour" && worst.scope !== "hour")
    ) {
      worst = candidate;
    }
  }
  return worst;
}
