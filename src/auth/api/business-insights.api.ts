import { adminFetchJson } from "@/auth/api/admin-http";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { AdminApi } from "@/auth/model/admin-routes";

export type AgeBand = "10s" | "20s" | "30s" | "40s" | "50s+" | "unknown";

export type AudienceBreakdown = {
  totalUsers: number;
  gender: { male: number; female: number; unknown: number };
  ageBands: Record<AgeBand, number>;
};

export type BusinessInsights = {
  businessId: string;
  partyId: string | null;
  generatedAt: number;
  visits: AudienceBreakdown;
  wishlists: AudienceBreakdown;
};

export function insightsQueryKey(partyId?: string) {
  return adminQueryKeys.insights(partyId);
}

export function getBusinessInsights(partyId?: string) {
  return adminFetchJson<BusinessInsights>(AdminApi.insights(partyId));
}
