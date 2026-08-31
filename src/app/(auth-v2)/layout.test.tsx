import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());

vi.mock("@/auth/guards/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => auth(),
}));

vi.mock("@/components/business-mobile/BusinessMobileChrome", () => ({
  BusinessMobileChrome: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="business-chrome">{children}</div>
  ),
}));

vi.mock("@/components/layout/AdminDesktopChrome", () => ({
  AdminDesktopChrome: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-chrome">{children}</div>
  ),
}));

import AuthV2AppLayout, { AuthenticatedShellFallback } from "./layout";

describe("AuthV2AppLayout", () => {
  beforeEach(() => auth.mockReset());
  afterEach(cleanup);

  it("renders only the business shell for business admins", async () => {
    auth.mockReturnValue({ admin: { role: "BUSINESS_ADMIN" } });
    render(<AuthV2AppLayout>내용</AuthV2AppLayout>);

    expect(await screen.findByTestId("business-chrome")).toHaveTextContent("내용");
    expect(screen.queryByTestId("admin-chrome")).not.toBeInTheDocument();
  });

  it("renders only the desktop shell for super admins", async () => {
    auth.mockReturnValue({ admin: { role: "SUPER_ADMIN" } });
    render(<AuthV2AppLayout>내용</AuthV2AppLayout>);

    expect(await screen.findByTestId("admin-chrome")).toHaveTextContent("내용");
    expect(screen.queryByTestId("business-chrome")).not.toBeInTheDocument();
  });

  it("does not choose or preload a role shell before the admin is known", () => {
    auth.mockReturnValue({ admin: null });
    render(<AuthV2AppLayout>내용</AuthV2AppLayout>);

    expect(screen.queryByTestId("admin-chrome")).not.toBeInTheDocument();
    expect(screen.queryByTestId("business-chrome")).not.toBeInTheDocument();
  });

  it("renders a content-shaped loading surface while a role shell is loading", () => {
    render(<AuthenticatedShellFallback />);

    expect(screen.getByRole("status", { name: "관리자 화면 준비 중" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
