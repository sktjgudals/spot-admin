import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(cleanup);

  it("offers Google next to the existing password form", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("google-signin")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dopa Admin" })).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apple로 계속하기" })).not.toBeInTheDocument();
  });

  it("offers Apple when the web Services ID is configured", () => {
    oidcClients.apple = "ing.dopa.admin.web";
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Apple로 계속하기" })).toBeInTheDocument();
  });

  it("associates validation errors with the affected credentials", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "로그인" }));

    const email = screen.getByLabelText("이메일");
    const password = screen.getByLabelText("비밀번호");
    expect(await screen.findByText("올바른 이메일을 입력하세요")).toHaveAttribute(
      "id",
      "email-error",
    );
    expect(screen.getByText("비밀번호를 입력하세요")).toHaveAttribute(
      "id",
      "password-error",
    );
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "email-error");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", "password-error");
  });

  it("keeps the password visibility control keyboard reachable and stateful", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const password = screen.getByLabelText("비밀번호");
    const toggle = screen.getByRole("button", { name: "비밀번호 보기" });
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "비밀번호 숨기기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
