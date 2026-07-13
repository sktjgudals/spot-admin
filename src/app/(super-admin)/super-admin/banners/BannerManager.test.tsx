import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BannerManager from "@/app/(super-admin)/super-admin/banners/BannerManager";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const initialBanners = [
  {
    id: "b1",
    title: "첫 배너",
    imageUrl: "https://example.com/a.png",
    linkUrl: null,
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("BannerManager", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("initialData로 배너 목록을 표시한다", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(initialBanners), { status: 200 }),
      ),
    );
    renderWithQuery(<BannerManager initialBanners={initialBanners} />);
    expect(screen.getAllByText("첫 배너").length).toBeGreaterThan(0);
  });

  it("삭제 후 invalidate로 목록을 갱신한다", async () => {
    const user = userEvent.setup();
    let list = [...initialBanners];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === "/api/super-admin/banners" &&
          (!init?.method || init.method === "GET")
        ) {
          return new Response(JSON.stringify(list), { status: 200 });
        }
        if (
          url === "/api/super-admin/banners/b1" &&
          init?.method === "DELETE"
        ) {
          list = [];
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify({ message: "unexpected" }), {
          status: 500,
        });
      }),
    );

    renderWithQuery(<BannerManager initialBanners={initialBanners} />);
    expect(screen.getAllByText("첫 배너").length).toBeGreaterThan(0);

    const deleteButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.className.includes("text-destructive"));
    expect(deleteButtons.length).toBeGreaterThan(0);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.queryAllByText("첫 배너")).toHaveLength(0);
      expect(screen.getByText("등록된 배너가 없습니다.")).toBeInTheDocument();
    });
  });
});
