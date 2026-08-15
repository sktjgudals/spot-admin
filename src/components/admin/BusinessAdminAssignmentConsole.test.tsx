import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-business.api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/auth/api/admin-business.api")>();
  return {
    ...original,
    listBusinesses: vi.fn(),
  };
});

vi.mock("@/components/admin/BusinessAdminPicker", () => ({
  BusinessAdminPicker: ({
    businessId,
    businessName,
    onAssigned,
  }: {
    businessId: string;
    businessName: string;
    onAssigned: (assignment: {
      nickname: string;
      email: string;
      businessId: string;
      businessName: string;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="business-admin-picker"
      onClick={() =>
        onAssigned({
          nickname: "서형민",
          email: "min@dopa.ing",
          businessId,
          businessName,
        })
      }
    >
      {businessId}:{businessName}
    </button>
  ),
}));

import { listBusinesses } from "@/auth/api/admin-business.api";
import { BusinessAdminAssignmentConsole } from "@/components/admin/BusinessAdminAssignmentConsole";

const activeBusinesses = [
  {
    id: "business-1",
    name: "도파 강남",
    kind: "COMPANY" as const,
    description: null,
    tagline: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    businessNumber: null,
    status: "ACTIVE" as const,
    feeRateBps: 1000,
    deletedAt: null,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
  {
    id: "business-2",
    name: "도파 홍대",
    kind: "INDIVIDUAL" as const,
    description: null,
    tagline: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    businessNumber: null,
    status: "ACTIVE" as const,
    feeRateBps: 1000,
    deletedAt: null,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
];

function renderConsole() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BusinessAdminAssignmentConsole />
    </QueryClientProvider>,
  );
}

describe("BusinessAdminAssignmentConsole", () => {
  beforeEach(() => {
    vi.mocked(listBusinesses).mockReset();
  });

  it("selects an active business and maps a registered user to it", async () => {
    vi.mocked(listBusinesses).mockResolvedValue(activeBusinesses);
    const user = userEvent.setup();

    renderConsole();

    expect(
      await screen.findByRole("option", { name: "도파 홍대" }),
    ).toBeInTheDocument();
    expect(listBusinesses).toHaveBeenCalledWith({ status: "ACTIVE" });
    expect(screen.queryByTestId("business-admin-picker")).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "업체" }),
      "business-2",
    );

    expect(screen.getByTestId("business-admin-picker")).toHaveTextContent(
      "business-2:도파 홍대",
    );
    expect(
      screen.getByText(/검색한 사용자는/, { selector: "div" }),
    ).toHaveTextContent("도파 홍대");

    await user.click(screen.getByTestId("business-admin-picker"));

    expect(screen.getByRole("status")).toHaveTextContent(
      "서형민님을 도파 홍대 업체 관리자로 배정했습니다.",
    );
  });
});
