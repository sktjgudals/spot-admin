import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/insights",
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    admin: {
      role: "BUSINESS_ADMIN",
      businessId: "biz_a",
      business: { name: "도파 라운지" },
    },
  }),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/auth/api/admin-party.api", () => ({
  listParties: vi.fn().mockResolvedValue([]),
  partyQueryKeys: { list: (id: string) => ["parties", id] },
}));

vi.mock("@/auth/api/business-insights.api", () => ({
  insightsQueryKey: (partyId?: string) => ["businessInsights", partyId ?? "all"],
  getBusinessInsights: vi.fn(),
}));

import { getBusinessInsights } from "@/auth/api/business-insights.api";
import BusinessInsightsPage from "./page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BusinessInsightsPage />
    </QueryClientProvider>,
  );
}

describe("BusinessInsightsPage", () => {
  beforeEach(() => {
    vi.mocked(getBusinessInsights).mockReset();
  });

  it("shows the error surface when the API fails", async () => {
    vi.mocked(getBusinessInsights).mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText("인사이트를 불러오지 못했어요.")).toBeInTheDocument();
  });

  it("feeds API counts into the charts", async () => {
    vi.mocked(getBusinessInsights).mockResolvedValue({
      businessId: "biz_a",
      partyId: null,
      generatedAt: 1,
      visits: {
        totalUsers: 5,
        gender: { male: 3, female: 2, unknown: 0 },
        ageBands: { "10s": 0, "20s": 5, "30s": 0, "40s": 0, "50s+": 0, unknown: 0 },
      },
      wishlists: {
        totalUsers: 0,
        gender: { male: 0, female: 0, unknown: 0 },
        ageBands: { "10s": 0, "20s": 0, "30s": 0, "40s": 0, "50s+": 0, unknown: 0 },
      },
    });
    renderPage();
    expect(await screen.findByText("5명")).toBeInTheDocument();
    expect(screen.getByText("남성 3")).toBeInTheDocument();
    expect(screen.getByText("아직 즐겨찾기가 없어요")).toBeInTheDocument();
  });
});
