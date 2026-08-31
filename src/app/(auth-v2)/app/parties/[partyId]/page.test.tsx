import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getParty: vi.fn(),
  listPartyCategories: vi.fn(),
  getPartyStatusHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ partyId: "party-1" }),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    admin: {
      role: "BUSINESS_ADMIN",
      businessId: "biz-1",
      name: "운영자",
    },
  }),
}));

vi.mock("@/auth/api/admin-party.api", () => ({
  getParty: mocks.getParty,
  listPartyCategories: mocks.listPartyCategories,
  getPartyStatusHistory: mocks.getPartyStatusHistory,
  partyQueryKeys: {
    detail: (id: string) => ["party", id],
    statusHistory: (id: string) => ["party", id, "history"],
    categories: ["party-categories"],
  },
}));

vi.mock("@/components/business-mobile/BusinessMobilePartyForm", () => ({
  BusinessMobilePartyForm: () => null,
}));
vi.mock("../../_components/PartyOperationsPanel", () => ({
  PartyOperationsPanel: () => null,
}));
vi.mock("../../_components/BusinessUserReviewsPanel", () => ({
  BusinessUserReviewsPanel: () => null,
}));

import MyPartyEditPage from "./page";

describe("MyPartyEditPage request scheduling", () => {
  beforeEach(() => {
    mocks.getParty.mockReset();
    mocks.listPartyCategories.mockReset();
    mocks.getPartyStatusHistory.mockReset();
  });

  afterEach(cleanup);

  it("prefetches independent form and operations data while detail is pending", async () => {
    mocks.getParty.mockImplementation(() => new Promise(() => undefined));
    mocks.listPartyCategories.mockResolvedValue([]);
    mocks.getPartyStatusHistory.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MyPartyEditPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.getParty).toHaveBeenCalledWith("party-1");
      expect(mocks.listPartyCategories).toHaveBeenCalledOnce();
      expect(mocks.getPartyStatusHistory).toHaveBeenCalledWith(
        "party-1",
        "business",
      );
    });
  });
});
