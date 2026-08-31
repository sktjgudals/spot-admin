import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "./layout";

const pathname = vi.hoisted(() => ({ value: "/login" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

describe("AuthLayout", () => {
  afterEach(cleanup);

  beforeEach(() => {
    pathname.value = "/login";
  });

  it("frames authentication as a restrained operations workspace", () => {
    render(
      <AuthLayout>
        <div>로그인 폼</div>
      </AuthLayout>,
    );

    expect(screen.getByText("운영은 더 선명하게.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "운영은 더 선명하게." }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "운영은 더 선명하게." }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("로그인 폼")).toBeInTheDocument();
    expect(screen.getByText("로그인 폼").parentElement).toHaveClass(
      "min-h-[43rem]",
      "justify-center",
    );
    expect(screen.getByText("One operating system")).toHaveClass(
      "data-kicker-on-contrast",
    );
  });

  it("keeps password reset focused without the product panel", () => {
    pathname.value = "/reset-password";
    render(
      <AuthLayout>
        <div>재설정 폼</div>
      </AuthLayout>,
    );

    expect(screen.queryByText("운영은 더 선명하게.")).not.toBeInTheDocument();
  });
});
