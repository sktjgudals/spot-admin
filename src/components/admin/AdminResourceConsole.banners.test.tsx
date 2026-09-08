import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/super-admin/banners",
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

vi.mock("@/auth/api/admin-resources.api", () => ({
  listAdminResources: vi.fn(),
  mutateAdminResource: vi.fn(),
}));

vi.mock("@/components/party-image-uploader", () => ({
  PartyImageUploader: (props: { onChange: (url: string) => void }) => (
    <button type="button" onClick={() => props.onChange("https://media.dopa.ing/banners/new.webp")}>
      업로드 스텁
    </button>
  ),
}));

import { listAdminResources, mutateAdminResource } from "@/auth/api/admin-resources.api";
import { AdminResourceConsole, resourceConfigs } from "@/components/admin/AdminResourceConsole";

const bannerRow = {
  id: "ban-1",
  title: "메인 배너",
  imageUrl: "https://media.dopa.ing/banners/a.webp",
  actionType: "INSTAGRAM",
  actionValue: "dopa.official",
  linkUrl: null,
  sortOrder: 0,
  isActive: true,
  startsAt: "2026-09-10T03:00:00.000Z",
  endsAt: null,
};

function renderBanners() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminResourceConsole config={resourceConfigs.banners} />
    </QueryClientProvider>,
  );
}

describe("AdminResourceConsole banners", () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    vi.mocked(listAdminResources).mockReset();
    vi.mocked(mutateAdminResource).mockReset();
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [bannerRow],
      nextCursor: null,
      asOf: "2026-09-08T00:00:00.000Z",
    });
    vi.mocked(mutateAdminResource).mockResolvedValue({ id: "ban-1" });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("creates a banner from an uploaded image", async () => {
    const user = userEvent.setup();
    renderBanners();
    await screen.findByText("배너 관리");

    await user.click(screen.getByRole("button", { name: "배너 추가" }));
    // exact: false — both fields are required, so their labels also carry a
    // visually hidden " *" marker (`<span aria-hidden>`) that @testing-library/dom's
    // label-text matcher includes in the label's matched text content (unlike
    // getByRole's accessible-name computation, which strips aria-hidden content).
    await user.type(screen.getByLabelText("제목", { exact: false }), "가을 파티");
    await user.click(screen.getByRole("button", { name: "업로드 스텁" }));
    expect(screen.getByLabelText("이미지", { exact: false })).toHaveValue(
      "https://media.dopa.ing/banners/new.webp",
    );
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(mutateAdminResource).toHaveBeenCalledWith(
      "/admin/v2/banners",
      "POST",
      expect.objectContaining({
        title: "가을 파티",
        imageUrl: "https://media.dopa.ing/banners/new.webp",
        actionType: "NONE",
        sortOrder: 0,
        isActive: true,
      }),
    );
    const body = vi.mocked(mutateAdminResource).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("startsAt");
    expect(body).not.toHaveProperty("endsAt");
  });

  it("round-trips the schedule and keeps the full action list on edit", async () => {
    const user = userEvent.setup();
    renderBanners();
    await screen.findByText("메인 배너");

    await user.click(screen.getAllByRole("button", { name: /수정/ })[0]);
    expect(await screen.findByRole("heading", { name: "배너 관리 수정" })).toBeInTheDocument();
    expect(screen.getByLabelText("액션")).toHaveValue("INSTAGRAM");
    // toHaveValue(expect.stringMatching(...)) isn't supported by the installed
    // jest-dom (6.9.1) — it compares against the matcher object itself rather than
    // applying it, so read the raw input value and assert with toMatch instead.
    const startsAtValue = (screen.getByLabelText("노출 시작") as HTMLInputElement).value;
    expect(startsAtValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    await user.clear(screen.getByLabelText("노출 시작"));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(mutateAdminResource).toHaveBeenCalledWith(
      "/admin/v2/banners/ban-1",
      "PATCH",
      expect.objectContaining({ actionType: "INSTAGRAM", startsAt: null, endsAt: null }),
    );
  });
});
