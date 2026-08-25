import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/auth/api/admin-business.api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/auth/api/admin-business.api")>();
  return {
    ...original,
    getBusinessCommerce: vi.fn(),
    updateBusinessCommerce: vi.fn(),
    activateBusinessCommerce: vi.fn(),
    pauseBusinessCommerce: vi.fn(),
  };
});

import {
  activateBusinessCommerce,
  getBusinessCommerce,
  pauseBusinessCommerce,
  updateBusinessCommerce,
  type BusinessCommerceOverview,
} from "@/auth/api/admin-business.api";
import { BusinessCommerceConsole } from "@/app/(auth-v2)/app/businesses/_components/BusinessCommerceConsole";

const overview: BusinessCommerceOverview = {
  profile: {
    businessId: "business-1",
    status: "DRAFT",
    paymentMode: "TEST",
    salesModel: "DIRECT",
    maxAmount: 49_000,
    salesUrl: "https://dopa.ing/parties/1",
    refundUrl: "https://dopa.ing/refunds",
    approvedByUserId: null,
    approvedAt: null,
    pausedByUserId: null,
    pausedAt: null,
    pauseReason: null,
    updatedByUserId: "admin-1",
    createdAt: 1_777_000_000_000,
    updatedAt: 1_777_000_000_000,
  },
  readiness: {
    businessId: "business-1",
    businessName: "도파 송도",
    businessActive: true,
    businessDisclosureComplete: true,
    refundPolicyPublished: true,
    payoutSellerStatus: null,
    payoutSellerApproved: false,
    payoutAccountReady: false,
    oldestUnresolvedPayoutAt: null,
  },
  missingRequirements: [],
  runtime: {
    environment: "staging",
    paymentMode: "TEST",
    paymentKeysValid: true,
    paymentKeyReasonCode: null,
    payoutMode: null,
    contractMaxAmount: 29_000,
    newPaymentsEnabled: false,
    externalHostPaymentsEnabled: false,
  },
};

function renderConsole() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BusinessCommerceConsole businessId="business-1" />
    </QueryClientProvider>,
  );
}

describe("BusinessCommerceConsole", () => {
  beforeEach(() => {
    vi.mocked(getBusinessCommerce).mockReset();
    vi.mocked(updateBusinessCommerce).mockReset();
    vi.mocked(activateBusinessCommerce).mockReset();
    vi.mocked(pauseBusinessCommerce).mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows verified readiness and the contract-intersected limit", async () => {
    vi.mocked(getBusinessCommerce).mockResolvedValue(overview);

    renderConsole();

    expect(await screen.findByText("현재 유효 한도")).toBeInTheDocument();
    expect(screen.getAllByText("29,000원")).toHaveLength(2);
    expect(screen.getByText("업체 활성 상태")).toBeInTheDocument();
    expect(screen.queryByText("정산 계좌 확인")).toBeNull();
    expect(screen.getByText(/신규 결제 스위치 OFF/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "결제 활성화" })).toBeEnabled();
  });

  it("saves a draft, activates it, and requires a reason before pausing", async () => {
    vi.mocked(getBusinessCommerce).mockResolvedValue(overview);
    vi.mocked(updateBusinessCommerce).mockResolvedValue(overview);
    vi.mocked(activateBusinessCommerce).mockResolvedValue({
      ...overview,
      profile: { ...overview.profile!, status: "ACTIVE" },
    });
    vi.mocked(pauseBusinessCommerce).mockResolvedValue({
      ...overview,
      profile: {
        ...overview.profile!,
        status: "PAUSED",
        pauseReason: "계약 점검",
      },
    });
    const user = userEvent.setup();

    renderConsole();
    await screen.findByDisplayValue("https://dopa.ing/parties/1");

    await user.click(screen.getByRole("button", { name: "초안 저장" }));
    await waitFor(() =>
      expect(updateBusinessCommerce).toHaveBeenCalledWith("business-1", {
        paymentMode: "TEST",
        salesModel: "DIRECT",
        maxAmount: 49_000,
        salesUrl: "https://dopa.ing/parties/1",
        refundUrl: "https://dopa.ing/refunds",
      }),
    );

    await user.click(screen.getByRole("button", { name: "결제 활성화" }));
    await waitFor(() =>
      expect(activateBusinessCommerce).toHaveBeenCalledWith("business-1"),
    );

    const pauseButton = screen.getByRole("button", { name: "신규 결제 중지" });
    expect(pauseButton).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "신규 결제 중지 사유" }),
      "계약 점검",
    );
    await user.click(pauseButton);
    await waitFor(() =>
      expect(pauseBusinessCommerce).toHaveBeenCalledWith(
        "business-1",
        "계약 점검",
      ),
    );
  });
});
