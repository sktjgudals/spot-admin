import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-business.api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/auth/api/admin-business.api")>();
  return {
    ...original,
    listBusinessesPage: vi.fn(),
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

import { listBusinessesPage } from "@/auth/api/admin-business.api";
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
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(listBusinessesPage).mockReset();
  });

  it("selects an active business and maps a registered user to it", async () => {
    vi.mocked(listBusinessesPage).mockResolvedValue({
      items: activeBusinesses,
      nextCursor: null,
      asOf: "2026-08-15T00:00:00.000Z",
    });
    const user = userEvent.setup();

    renderConsole();

    expect(
      await screen.findByRole("option", { name: "도파 홍대" }),
    ).toBeInTheDocument();
    expect(listBusinessesPage).toHaveBeenCalledWith({
      status: "ACTIVE",
      limit: 100,
      cursor: undefined,
    });
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

  it("renders one active-business cursor page at a time and returns to the cached page", async () => {
    vi.mocked(listBusinessesPage)
      .mockResolvedValueOnce({
        items: [activeBusinesses[0]],
        nextCursor: "active-page-2",
        asOf: "2026-08-15T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        items: [activeBusinesses[1]],
        nextCursor: null,
        asOf: "2026-08-15T00:00:00.000Z",
      });
    const user = userEvent.setup();

    renderConsole();

    expect(await screen.findByRole("option", { name: "도파 강남" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "도파 홍대" })).toBeNull();
    const businessSelect = screen.getByRole("combobox", { name: "업체" });

    await user.click(screen.getByRole("button", { name: "활성 업체 더 보기" }));

    expect(await screen.findByRole("option", { name: "도파 홍대" })).toBeInTheDocument();
    await waitFor(() => expect(businessSelect).toHaveFocus());
    expect(businessSelect).toHaveValue("");
    expect(screen.queryByRole("option", { name: "도파 강남" })).toBeNull();
    expect(screen.getByText("2페이지")).toBeInTheDocument();
    expect(listBusinessesPage).toHaveBeenLastCalledWith({
      status: "ACTIVE",
      limit: 100,
      cursor: "active-page-2",
    });

    await user.click(screen.getByRole("button", { name: "이전 활성 업체" }));

    expect(await screen.findByRole("option", { name: "도파 강남" })).toBeInTheDocument();
    await waitFor(() => expect(businessSelect).toHaveFocus());
    expect(screen.queryByRole("option", { name: "도파 홍대" })).toBeNull();
  });

  it("keeps loaded businesses and focuses retry before selecting a recovered terminal page", async () => {
    vi.mocked(listBusinessesPage)
      .mockResolvedValueOnce({
        items: [activeBusinesses[0]],
        nextCursor: "active-page-2",
        asOf: "2026-08-15T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("next page unavailable"))
      .mockResolvedValueOnce({
        items: [activeBusinesses[1]],
        nextCursor: null,
        asOf: "2026-08-15T00:00:01.000Z",
      });
    const user = userEvent.setup();
    renderConsole();

    expect(await screen.findByRole("option", { name: "도파 강남" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "활성 업체 더 보기" }));

    const retry = await screen.findByRole("button", { name: "다음 업체 다시 시도" });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByRole("option", { name: "도파 강남" })).toBeInTheDocument();

    await user.click(retry);
    expect(await screen.findByRole("option", { name: "도파 홍대" })).toBeInTheDocument();
    const businessSelect = screen.getByRole("combobox", { name: "업체" });
    await waitFor(() => expect(businessSelect).toHaveFocus());
    expect(businessSelect).toHaveValue("");
    expect(screen.queryByRole("option", { name: "도파 강남" })).toBeNull();
  });
});
