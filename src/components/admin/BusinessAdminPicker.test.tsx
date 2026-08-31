import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-business.api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/auth/api/admin-business.api")>();
  return {
    ...original,
    assignBusinessAdmin: vi.fn(),
    searchBusinessAdminCandidates: vi.fn(),
  };
});

import {
  searchBusinessAdminCandidates,
  type BusinessAdminCandidate,
} from "@/auth/api/admin-business.api";
import { BusinessAdminPicker } from "./BusinessAdminPicker";

const firstCandidate: BusinessAdminCandidate = {
  id: "user-1",
  email: "first@example.com",
  nickname: "첫 번째 사용자",
  profileImage: null,
  role: "USER",
  status: "ACTIVE",
  assignedBusinessId: null,
};

const secondCandidate: BusinessAdminCandidate = {
  ...firstCandidate,
  id: "user-21",
  email: "next@example.com",
  nickname: "스물한 번째 사용자",
};

function renderPicker() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BusinessAdminPicker businessId="business-1" />
    </QueryClientProvider>,
  );
}

describe("BusinessAdminPicker", () => {
  beforeEach(() => {
    vi.mocked(searchBusinessAdminCandidates).mockReset();
  });

  afterEach(cleanup);

  it("renders one candidate cursor page at a time and can return to the cached page", async () => {
    vi.mocked(searchBusinessAdminCandidates)
      .mockResolvedValueOnce({
        items: [firstCandidate],
        nextCursor: "candidate-page-2",
        asOf: "2026-09-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        items: [secondCandidate],
        nextCursor: null,
        asOf: "2026-09-01T00:00:01.000Z",
      });
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByRole("textbox", { name: "기존 사용자 검색" }), "사용자");
    await user.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("첫 번째 사용자")).toBeInTheDocument();
    expect(screen.queryByText("스물한 번째 사용자")).toBeNull();

    await user.click(screen.getByRole("button", { name: "검색 결과 더 보기" }));

    const appendedCandidate = await screen.findByText("스물한 번째 사용자");
    await waitFor(() =>
      expect(appendedCandidate.closest("[tabindex='-1']")).toHaveFocus(),
    );
    expect(screen.queryByText("첫 번째 사용자")).toBeNull();
    expect(screen.getByText("2페이지")).toBeInTheDocument();
    expect(searchBusinessAdminCandidates).toHaveBeenLastCalledWith("사용자", {
      cursor: "candidate-page-2",
      limit: 20,
    });

    await user.click(screen.getByRole("button", { name: "이전 검색 결과" }));

    const previousCandidate = await screen.findByText("첫 번째 사용자");
    await waitFor(() =>
      expect(previousCandidate.closest("[tabindex='-1']")).toHaveFocus(),
    );
    expect(screen.queryByText("스물한 번째 사용자")).toBeNull();
  });

  it("keeps prior candidates and focuses retry before a cursor request recovers", async () => {
    vi.mocked(searchBusinessAdminCandidates)
      .mockResolvedValueOnce({
        items: [firstCandidate],
        nextCursor: "candidate-page-2",
        asOf: "2026-09-01T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("next page unavailable"))
      .mockResolvedValueOnce({
        items: [secondCandidate],
        nextCursor: null,
        asOf: "2026-09-01T00:00:01.000Z",
      });
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByRole("textbox", { name: "기존 사용자 검색" }), "사용자");
    await user.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText("첫 번째 사용자")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 결과 더 보기" }));

    const retry = await screen.findByRole("button", {
      name: "다음 검색 결과 다시 시도",
    });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByText("첫 번째 사용자")).toBeInTheDocument();

    await user.click(retry);
    const appendedCandidate = await screen.findByText("스물한 번째 사용자");
    await waitFor(() =>
      expect(appendedCandidate.closest("[tabindex='-1']")).toHaveFocus(),
    );
    expect(screen.queryByText("첫 번째 사용자")).toBeNull();
  });
});
