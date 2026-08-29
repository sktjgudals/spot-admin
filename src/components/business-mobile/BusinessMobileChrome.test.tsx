import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mail",
}));

import { BusinessBottomNav } from "@/components/business-mobile/BusinessMobileChrome";

describe("BusinessBottomNav", () => {
  it("links to the business mailbox and marks it active", () => {
    render(<BusinessBottomNav />);

    const mail = screen.getByRole("link", { name: "메일" });
    expect(mail).toHaveAttribute("href", "/app/mail");
    expect(mail).toHaveAttribute("aria-current", "page");
  });
});
