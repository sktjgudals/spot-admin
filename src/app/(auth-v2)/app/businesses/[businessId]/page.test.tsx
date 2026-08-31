import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getBusinessCommerce: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ businessId: "biz-1" }),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/api/admin-business.api", () => ({
  getBusiness: mocks.getBusiness,
  getBusinessCommerce: mocks.getBusinessCommerce,
  businessQueryKeys: {
    detail: (id: string) => ["business", id],
    commerce: (id: string) => ["business", id, "commerce"],
  },
}));

vi.mock("../_components/BusinessStatusBadge", () => ({
  BusinessStatusBadge: () => null,
}));
vi.mock("../_components/BusinessLifecycleActions", () => ({
  BusinessLifecycleActions: () => null,
}));
vi.mock("../_components/BusinessCommerceConsole", () => ({
  BusinessCommerceConsole: () => null,
}));
vi.mock("@/components/admin/BusinessAdminPicker", () => ({
  BusinessAdminPicker: () => null,
}));

import BusinessDetailPage from "./page";

describe("BusinessDetailPage request scheduling", () => {
  beforeEach(() => {
    mocks.getBusiness.mockReset();
    mocks.getBusinessCommerce.mockReset();
  });

  afterEach(cleanup);

  it("starts the independent commerce request while business detail is pending", async () => {
    mocks.getBusiness.mockImplementation(() => new Promise(() => undefined));
    mocks.getBusinessCommerce.mockResolvedValue({});
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <BusinessDetailPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.getBusiness).toHaveBeenCalledWith("biz-1");
      expect(mocks.getBusinessCommerce).toHaveBeenCalledWith("biz-1");
    });
  });
});
