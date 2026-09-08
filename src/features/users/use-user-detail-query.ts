"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAdminUser,
  getAdminUserSummary,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/auth/api/admin-users.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";

export function useUserDetailQuery(userId: string) {
  return useQuery<AdminUserDetail, Error>({
    queryKey: adminQueryKeys.users.detail(userId),
    queryFn: () => getAdminUser(userId),
    // A 404 or a 403 will not become a 200 on the third attempt; retrying only
    // delays the message that tells the operator which of the two it was.
    retry: false,
    staleTime: 30_000,
  });
}

export function useUserSummaryQuery(
  userId: string,
  { enabled }: { enabled: boolean },
) {
  return useQuery<AdminUserSummary | null, Error>({
    queryKey: adminQueryKeys.users.summary(userId),
    queryFn: () => getAdminUserSummary(userId),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}
