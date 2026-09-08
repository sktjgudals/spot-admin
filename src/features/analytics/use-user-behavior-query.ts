"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { analyticsQueryKeys } from "./analytics-query-keys";
import {
  clearAnalyticsAccessToken,
  getAnalyticsAccessToken,
} from "./analytics-token-store";
import type { AnalyticsPropertyConfig } from "./types";
import {
  fetchUserBehaviorFlow,
  type UserBehaviorFlow,
  type UserBehaviorRange,
} from "./user-behavior-report";

/**
 * 토큰은 queryFn 안에서만 읽는다. 컴포넌트 props나 쿼리 키에 실으면 React
 * DevTools, 오류 리포트, 쿼리 캐시 스냅숏에 그대로 남는다.
 */
export function useUserBehaviorQuery({
  property,
  userId,
  range,
  generation,
}: {
  property: AnalyticsPropertyConfig;
  userId: string;
  range: UserBehaviorRange;
  generation: number;
}) {
  const query = useQuery<UserBehaviorFlow, Error>({
    queryKey: analyticsQueryKeys.userBehavior(generation, property.id, userId, range),
    queryFn: ({ signal }) => {
      const accessToken = getAnalyticsAccessToken();
      if (!accessToken) {
        throw new AnalyticsDataApiError(
          "expired",
          "Google Analytics 연결이 만료되었습니다.",
        );
      }
      return fetchUserBehaviorFlow({ property, userId, range, accessToken, signal });
    },
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof AnalyticsDataApiError && query.error.kind === "expired") {
      clearAnalyticsAccessToken("expired");
    }
  }, [query.error]);

  return query;
}
