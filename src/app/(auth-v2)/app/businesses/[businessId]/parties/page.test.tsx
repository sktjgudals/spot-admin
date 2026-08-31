import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const desktopPanel = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => ({ businessId: "biz/url value" }),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    admin: { role: "SUPER_ADMIN", businessId: null, name: "관리자" },
  }),
}));

vi.mock("../../../_components/DesktopPartyListPanel", () => ({
  DesktopPartyListPanel: (props: unknown) => {
    desktopPanel(props);
    return <div data-testid="desktop-party-panel" />;
  },
}));

import SuperAdminBusinessPartiesPage from "./page";

describe("SuperAdminBusinessPartiesPage bundle boundary", () => {
  afterEach(() => {
    cleanup();
    desktopPanel.mockReset();
  });

  it("renders only the desktop panel with encoded scoped paths", () => {
    render(<SuperAdminBusinessPartiesPage />);

    expect(screen.getByTestId("desktop-party-panel")).toBeInTheDocument();
    const props = desktopPanel.mock.calls[0]?.[0] as {
      businessId: string;
      partyHref: (partyId: string) => string;
      createHref: string;
    };
    expect(props.businessId).toBe("biz/url value");
    expect(props.partyHref("party/value")).toContain("biz%2Furl%20value");
    expect(props.partyHref("party/value")).toContain("party%2Fvalue");
    expect(props.createHref).toContain("biz%2Furl%20value");
  });
});
