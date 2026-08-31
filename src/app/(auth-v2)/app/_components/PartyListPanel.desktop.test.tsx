import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listParties: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => "/app/businesses/biz-1/parties" }));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({ admin: { role: "SUPER_ADMIN", name: "관리자" } }),
}));

vi.mock("@/auth/api/admin-party.api", () => ({
  listParties: mocks.listParties,
  partyQueryKeys: {
    list: (businessId: string, scope: string) => ["parties", businessId, scope],
  },
}));

import { DesktopPartyListPanel } from "./DesktopPartyListPanel";

describe("PartyListPanel desktop view", () => {
  afterEach(cleanup);

  it("discloses the legacy 100-row API ceiling instead of presenting a silent complete list", async () => {
    mocks.listParties.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        id: `party-${index}`,
        title: `파티 ${index + 1}`,
        date: "2026-09-01T10:00:00.000Z",
        location: "서울",
        currentCount: 0,
        maxCapacity: 20,
        operationalStatus: "DRAFT",
      })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DesktopPartyListPanel
          businessId="biz-1"
          partyHref={(id) => `/app/businesses/biz-1/parties/${id}`}
          createHref="/app/businesses/biz-1/parties/new"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API가 반환하는 최대 100개만 표시",
    );
    expect(screen.getByText("파티 100")).toBeInTheDocument();
  });
});
