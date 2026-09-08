import type { AnalyticsFilterExpression } from "./analytics-data-api";
import type { AnalyticsPropertyPlatform } from "./types";

/**
 * The two questions an operator asks of every report: which platform, and
 * consumer or business.
 *
 * Platform is a GA4 built-in dimension. Account type is not — it needs a
 * user-scoped custom dimension registered from the app's `account_type` user
 * property, so the UI asks the property what it has before offering it
 * (`fetchAnalyticsCapabilities`).
 */

export const ANALYTICS_PLATFORMS = ["iOS", "Android", "web"] as const;

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

export type AnalyticsAccountType = "all" | "consumer" | "business";

export type AnalyticsFilters = {
  platforms: readonly AnalyticsPlatform[];
  accountType: AnalyticsAccountType;
};

export const ACCOUNT_TYPE_DIMENSION = "customUser:account_type";

export const PLATFORM_DIMENSION = "platform";

export const EMPTY_FILTERS: AnalyticsFilters = {
  platforms: [],
  accountType: "all",
};

function canonicalPlatforms(
  platforms: readonly AnalyticsPlatform[],
): AnalyticsPlatform[] {
  return ANALYTICS_PLATFORMS.filter((platform) => platforms.includes(platform));
}

/**
 * Stable identity for the React Query key. Two selections that request the
 * same data must produce the same string, or clicking a chip off and on again
 * refetches what is already cached.
 */
export function filtersKey(filters: AnalyticsFilters): string {
  return `${canonicalPlatforms(filters.platforms).join(",")}|${filters.accountType}`;
}

export function activeFilterCount(filters: AnalyticsFilters): number {
  return filters.platforms.length + (filters.accountType === "all" ? 0 : 1);
}

export function togglePlatform(
  filters: AnalyticsFilters,
  platform: AnalyticsPlatform,
): AnalyticsFilters {
  const next = filters.platforms.includes(platform)
    ? filters.platforms.filter((value) => value !== platform)
    : [...filters.platforms, platform];
  return { ...filters, platforms: canonicalPlatforms(next) };
}

export function buildDimensionFilter(
  filters: AnalyticsFilters,
): AnalyticsFilterExpression | undefined {
  const expressions: AnalyticsFilterExpression[] = [];
  const platforms = canonicalPlatforms(filters.platforms);

  if (platforms.length > 0) {
    // `caseSensitive` is deliberately omitted (GA4 defaults it to false). The
    // published docs quote "iOS" and "Android" from a real response but only
    // describe the web value in prose, so an exact-case list could silently
    // match nothing.
    expressions.push({
      filter: {
        fieldName: PLATFORM_DIMENSION,
        inListFilter: { values: platforms },
      },
    });
  }
  if (filters.accountType !== "all") {
    expressions.push({
      filter: {
        fieldName: ACCOUNT_TYPE_DIMENSION,
        stringFilter: { matchType: "EXACT", value: filters.accountType },
      },
    });
  }

  if (expressions.length === 0) return undefined;
  if (expressions.length === 1) return expressions[0];
  return { andGroup: { expressions } };
}

/**
 * A single-platform property has exactly one platform value, so a platform
 * chip there can only ever filter everything or nothing. Only a `mixed`
 * property gets the chips.
 */
export function availablePlatforms(
  platform: AnalyticsPropertyPlatform,
): readonly AnalyticsPlatform[] {
  return platform === "mixed" ? ANALYTICS_PLATFORMS : [];
}

const PLATFORM_ALIASES: Record<string, AnalyticsPlatform> = {
  ios: "iOS",
  android: "Android",
  web: "web",
};

/** GA4's exact casing for the web value is not documented; fold it here once. */
export function normalizePlatform(value: string): string {
  return PLATFORM_ALIASES[value.trim().toLowerCase()] ?? value;
}
