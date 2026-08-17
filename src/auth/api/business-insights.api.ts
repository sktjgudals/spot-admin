import { adminFetchJson } from "@/auth/api/admin-http";

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
  return ["businessInsights", partyId ?? "all"] as const;
}

export function getBusinessInsights(partyId?: string) {
  const query =
    partyId === undefined || partyId === ""
      ? ""
      : `?partyId=${encodeURIComponent(partyId)}`;
  return adminFetchJson<BusinessInsights>(`/businesses/me/insights${query}`);
}
