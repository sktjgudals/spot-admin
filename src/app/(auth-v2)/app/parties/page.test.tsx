import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  businessPanel: vi.fn(),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({ admin: mocks.admin() }),
}));

vi.mock("../_components/BusinessPartyListPanel", () => ({
  BusinessPartyListPanel: (props: unknown) => {
    mocks.businessPanel(props);
    return <div data-testid="business-party-panel" />;
  },
}));

import AppPartiesPage from "./page";

describe("AppPartiesPage role bundle boundary", () => {
  beforeEach(() => {
    mocks.admin.mockReset();
    mocks.businessPanel.mockReset();
  });

  afterEach(cleanup);

  it("does not render or load the operator panel for a super admin", () => {
    mocks.admin.mockReturnValue({
      role: "SUPER_ADMIN",
      businessId: null,
      name: "관리자",
    });

    render(<AppPartiesPage />);

    expect(screen.getByText("파티 (SUPER_ADMIN)")).toBeInTheDocument();
    expect(screen.queryByTestId("business-party-panel")).not.toBeInTheDocument();
    expect(mocks.businessPanel).not.toHaveBeenCalled();
  });

  it("passes only the profile business scope to the operator panel", async () => {
    mocks.admin.mockReturnValue({
      role: "BUSINESS_ADMIN",
      businessId: "biz-profile",
      name: "운영자",
    });

    render(<AppPartiesPage />);

    expect(await screen.findByTestId("business-party-panel")).toBeInTheDocument();
    expect(mocks.businessPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-profile",
        createHref: "/app/parties/new",
      }),
    );
  });
});
