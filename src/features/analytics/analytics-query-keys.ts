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
  report: (
    generation: number,
    propertyId: string,
    view: AnalyticsReportView,
    range: AnalyticsDateRange,
  ) => ["google-analytics", generation, propertyId, view, range] as const,
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
