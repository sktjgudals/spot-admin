import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const oidcClients = vi.hoisted(() => ({ apple: "" }));

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
  publicAppleClientId: () => oidcClients.apple,
}));

import LoginPage from "./page";

describe("Admin login page", () => {
  beforeEach(() => {
    oidcClients.apple = "";
  });

  it("offers Google next to the existing password form", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("google-signin")).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apple로 계속하기" })).not.toBeInTheDocument();
  });

  it("offers Apple when the web Services ID is configured", () => {
    oidcClients.apple = "ing.dopa.admin.web";
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Apple로 계속하기" })).toBeInTheDocument();
  });
});
