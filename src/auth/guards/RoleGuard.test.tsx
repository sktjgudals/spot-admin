import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUSINESS_ADMIN_ONLY,
  SUPER_ADMIN_ONLY,
} from "@/auth/model/admin-auth.types";

const replace = vi.fn();
const auth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => auth(),
}));

import { RoleGuard } from "./RoleGuard";

describe("RoleGuard", () => {
  beforeEach(() => {
    replace.mockReset();
    auth.mockReset();
  });

  it("renders children for an allowed role", () => {
    auth.mockReturnValue({
      status: "authenticated",
      admin: { role: "BUSINESS_ADMIN", businessId: "biz-1" },
    });
    render(
      <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
        <p>파티 목록</p>
      </RoleGuard>,
    );
    expect(screen.getByText("파티 목록")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects a super-admin away from a business-only page", () => {
    auth.mockReturnValue({
      status: "authenticated",
      admin: { role: "SUPER_ADMIN", businessId: null },
    });
    render(
      <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
        <p>파티 목록</p>
      </RoleGuard>,
    );
    expect(screen.getByText("이 페이지에 접근할 권한이 없습니다. 이동 중…")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/super-admin/dashboard");
  });

  it("keeps super-admin on a super-admin page", () => {
    auth.mockReturnValue({
      status: "authenticated",
      admin: { role: "SUPER_ADMIN", businessId: null },
    });
    render(
      <RoleGuard allow={SUPER_ADMIN_ONLY}>
        <p>대시보드</p>
      </RoleGuard>,
    );
    expect(screen.getByText("대시보드")).toBeInTheDocument();
  });
});
