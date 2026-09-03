import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const auth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => auth(),
}));

import { AuthGuard } from "./AuthGuard";

describe("AuthGuard", () => {
  beforeEach(() => {
    replace.mockReset();
    auth.mockReset();
  });

  it("sends an unauthenticated visitor to login", () => {
    auth.mockReturnValue({
      status: "unauthenticated",
      bootError: null,
      retryBoot: vi.fn(),
    });
    render(
      <AuthGuard>
        <p>비밀</p>
      </AuthGuard>,
    );
    expect(screen.getByText("로그인 페이지로 이동 중…")).toBeInTheDocument();
    // The marker tells the edge middleware not to bounce this back to /app on
    // the strength of a cookie the API has already refused.
    expect(replace).toHaveBeenCalledWith("/login?signedOut=1");
  });

  it("renders children once authenticated", () => {
    auth.mockReturnValue({
      status: "authenticated",
      bootError: null,
      retryBoot: vi.fn(),
    });
    render(
      <AuthGuard>
        <p>비밀</p>
      </AuthGuard>,
    );
    expect(screen.getByText("비밀")).toBeInTheDocument();
  });
});
