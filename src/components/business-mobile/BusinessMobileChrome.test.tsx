import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mail",
}));

import {
  BusinessBottomNav,
  BusinessLogoHeader,
} from "@/components/business-mobile/BusinessMobileNavigation";

afterEach(cleanup);

describe("BusinessBottomNav", () => {
  it("links to the business mailbox and marks it active", () => {
    render(<BusinessBottomNav />);

    const mail = screen.getByRole("link", { name: "메일" });
    expect(mail).toHaveAttribute("href", "/app/mail");
    expect(mail).toHaveAttribute("aria-current", "page");
  });

  it("does not expose a notification control without a notification contract", () => {
    render(<BusinessLogoHeader />);

    expect(screen.getByRole("link", { name: "Dopa 업체 관리자 홈" })).toHaveAttribute(
      "href",
      "/app/parties",
    );
    expect(screen.queryByRole("button", { name: "알림" })).not.toBeInTheDocument();
  });
});
