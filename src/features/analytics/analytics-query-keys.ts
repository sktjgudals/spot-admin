import type { AnalyticsDateRange, AnalyticsReportView } from "./types";
import type { UserBehaviorRange } from "./user-behavior-report";

/**
 * One key factory for every GA-backed query.
 *
 * `all` is a prefix of every other key, so cancelling and removing it when the
 * token goes away really does drop every cached Google response — an alias key
 * defined somewhere else would keep one alive past the disconnect.
 *
 * `generation` is the token store's non-secret counter: a reconnect produces a
 * new generation, so a fresh grant never reads the previous grant's cache.
 */
export const analyticsQueryKeys = {
  all: ["google-analytics"] as const,
  /**
   * `filters` and `variant` are separate segments so a filter change is a new
   * cache entry (and `keepPreviousData` can hold the old table on screen)
   * while the view/range/property prefix stays intact for invalidation.
   * `variant` carries the funnel preset and breakdown; other views pass "".
   */
  report: (
    generation: number,
    propertyId: string,
    view: AnalyticsReportView,
    range: AnalyticsDateRange,
    filters: string,
    variant: string,
  ) =>
    [
      "google-analytics",
      generation,
      propertyId,
      view,
      range,
      filters,
      variant,
    ] as const,
  capabilities: (generation: number, propertyId: string) =>
    ["google-analytics", generation, propertyId, "capabilities"] as const,
  userBehavior: (
    generation: number,
    propertyId: string,
    userId: string,
    range: UserBehaviorRange,
  ) =>
    [
      "google-analytics",
      "user-behavior",
      generation,
      propertyId,
      userId,
      range,
    ] as const,
};
