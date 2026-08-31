import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCategories: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/auth/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({ admin: { role: "BUSINESS_ADMIN" } }),
}));

vi.mock("@/auth/api/admin-party.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/admin-party.api")>();
  return {
    ...actual,
    listPartyCategories: mocks.listCategories,
    createParty: vi.fn(),
    updateParty: vi.fn(),
  };
});

vi.mock("@/auth/query/use-admin-mutation", () => ({
  useAdminMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/components/party-image-uploader", () => ({
  PartyImageUploader: () => <div>이미지 업로더</div>,
}));

import { BusinessMobilePartyForm } from "./BusinessMobilePartyForm";

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BusinessMobilePartyForm
        mode="create"
        businessId="business-1"
        successHref={(partyId) => `/app/parties/${partyId}`}
        cancelHref="/app/parties"
      />
    </QueryClientProvider>,
  );
}

describe("BusinessMobilePartyForm accessibility", () => {
  beforeEach(() => {
    mocks.listCategories.mockReset();
    mocks.listCategories.mockResolvedValue([
      { id: "social", name: "소셜", status: "ACTIVE", sortOrder: 1, iconUrl: null },
      { id: "fixed", name: "시그니처", status: "FIXED", sortOrder: 2, iconUrl: null },
    ]);
  });

  afterEach(cleanup);

  it("exposes selected category and admission mode without relying on color", async () => {
    const user = userEvent.setup();
    renderForm();

    const social = await screen.findByRole("button", { name: "소셜" });
    const signature = screen.getByRole("button", { name: "시그니처" });
    expect(social).toHaveAttribute("aria-pressed", "true");
    expect(signature).toHaveAttribute("aria-pressed", "false");

    await user.click(signature);
    expect(signature).toHaveAttribute("aria-pressed", "true");
    expect(social).toHaveAttribute("aria-pressed", "false");

    const approval = screen.getByRole("button", { name: "승인제" });
    const instant = screen.getByRole("button", { name: "신청 즉시 참여" });
    expect(approval).toHaveAttribute("aria-pressed", "true");
    await user.click(instant);
    expect(instant).toHaveAttribute("aria-pressed", "true");
    expect(approval).toHaveAttribute("aria-pressed", "false");
  });

  it("gives the Kakao place query its own accessible name", async () => {
    renderForm();

    expect(await screen.findByRole("textbox", { name: "장소 검색어" })).toHaveAttribute(
      "placeholder",
      "예: 강남역 카페",
    );
  });
});
