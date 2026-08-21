import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const acceptIssuedSession = vi.fn(() => "BUSINESS_ADMIN");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    status: "unauthenticated",
    admin: null,
    homePath: null,
    acceptIssuedSession,
  }),
}));

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

vi.mock("@/auth/store/admin-auth.store", () => ({
  setAccessToken: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import { setAccessToken } from "@/auth/store/admin-auth.store";
import { InviteAcceptForm } from "./page";

describe("InviteAcceptPage", () => {
  beforeEach(() => {
    replace.mockReset();
    acceptIssuedSession.mockClear();
    vi.mocked(adminFetchJson).mockReset();
    vi.mocked(setAccessToken).mockReset();
  });

  it("adopts the issued session instead of writing the token around the provider", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({
      accessToken: "access-token",
      admin: {
        id: "admin-1",
        email: "op@dopa.ing",
        name: "운영자",
        role: "ADMIN",
        businessId: "biz-1",
        status: "ACTIVE",
      },
    });
    const user = userEvent.setup();
    render(<InviteAcceptForm token="invite-token" />);

    await user.type(screen.getByLabelText("이름"), "운영자");
    await user.type(screen.getByLabelText("비밀번호 (10자+)"), "password12");
    await user.click(screen.getByRole("button", { name: "가입 완료" }));

    expect(acceptIssuedSession).toHaveBeenCalledWith({
      accessToken: "access-token",
      admin: {
        id: "admin-1",
        email: "op@dopa.ing",
        name: "운영자",
        role: "ADMIN",
        businessId: "biz-1",
        status: "ACTIVE",
      },
    });
    expect(setAccessToken).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/app/parties");
  });
});
