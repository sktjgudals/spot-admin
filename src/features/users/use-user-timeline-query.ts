"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getAdminUserTimeline } from "@/auth/api/admin-users.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";

export type UserTimelineQueryFilters = {
  /** Chip selection; also the client-side filter after the rows arrive. */
  categories: readonly string[];
  /** Server-side hint derived from `categories`. */
  kinds: readonly string[] | undefined;
  from: string | null;
};

export function useUserTimelineQuery(
  userId: string,
  filters: UserTimelineQueryFilters,
) {
  return useInfiniteQuery({
    queryKey: adminQueryKeys.users.timeline(userId, {
      // Sorted and joined so toggling A then B caches the same page as B then A.
      categories: [...filters.categories].sort().join(","),
      from: filters.from ?? "",
    }),
    queryFn: ({ pageParam }) =>
      getAdminUserTimeline(userId, {
        ...(filters.kinds && filters.kinds.length > 0 ? { kinds: filters.kinds } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: false,
  });
}
