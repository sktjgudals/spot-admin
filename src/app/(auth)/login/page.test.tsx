import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    status: "unauthenticated",
    login: vi.fn(),
    loginWithProvider: vi.fn(),
    homePath: null,
    admin: null,
  }),
}));

vi.mock("@/auth/oidc/google-gis", () => ({
  GoogleSignInButton: () => <div data-testid="google-signin" />,
}));

vi.mock("@/auth/oidc/public-clients", () => ({
  publicGoogleClientId: () => "google-web-client",
  publicAppleClientId: () => "",
}));

import LoginPage from "./page";

describe("Admin login page", () => {
  it("offers Google next to the existing password form", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("google-signin")).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apple로 계속하기" })).not.toBeInTheDocument();
  });
});
