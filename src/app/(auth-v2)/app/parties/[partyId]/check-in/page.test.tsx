import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getParty: vi.fn(),
  getStatus: vi.fn(),
  checkInManually: vi.fn(),
  checkInByQr: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ partyId: "party-1" }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/auth/guards/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/api/business-operator.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/api/business-operator.api")>();
  return {
    ...actual,
    getOperatorPartyDetail: mocks.getParty,
    getCheckInStatus: mocks.getStatus,
    checkInManually: mocks.checkInManually,
    checkInByQr: mocks.checkInByQr,
  };
});

import PartyCheckInPage, { QrScannerLoadState } from "./page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PartyCheckInPage />
    </QueryClientProvider>,
  );
}

describe("PartyCheckInPage", () => {
  beforeEach(() => {
    mocks.getParty.mockReset();
    mocks.getStatus.mockReset();
    mocks.checkInManually.mockReset();
    mocks.checkInByQr.mockReset();
    mocks.getParty.mockResolvedValue({
      id: "party-1",
      title: "도파 소셜",
      location: "서울",
      date: "2026-09-01T10:00:00.000Z",
      startsAt: "2026-09-01T10:00:00.000Z",
    });
    const participants = Array.from({ length: 65 }, (_, index) => ({
      userId: `user-${index}`,
      nickname: index === 64 ? "마지막 참가자" : `참가자 ${index + 1}`,
      profileImage: `https://media.dopa.ing/profiles/user-${index}.jpg`,
      checkedIn: index % 2 === 0,
      lastEventType: null,
      lastEventAt: null,
      lastMethod: null,
      gender: index % 2 === 0 ? "MALE" : "FEMALE",
      birthYear: 1998,
    }));
    mocks.getStatus.mockResolvedValue({
      partyId: "party-1",
      confirmedCount: 65,
      checkedInCount: 33,
      checkedOutCount: 0,
      noShowCount: 0,
      notCheckedInCount: 32,
      truncated: true,
      participants,
    });
  });

  afterEach(cleanup);

  it("caps the initial DOM, progressively reveals participants, and discloses API truncation", async () => {
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("list", { name: "체크인 참가자 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(60);
    expect(screen.getByRole("alert")).toHaveTextContent("최대 500명");
    expect(screen.getByText("60 / 65명 표시 중")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "참가자 더 보기" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(65);
    expect(screen.queryByRole("button", { name: "참가자 더 보기" })).not.toBeInTheDocument();
    expect(screen.getByText("참가자 61").closest("li")).toHaveFocus();
  });

  it("filters by nickname and attendance without keeping the previous render window", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("list", { name: "체크인 참가자 목록" });
    const search = screen.getByRole("searchbox", { name: "참가자 검색" });
    expect(search).toHaveAttribute("id", "check-in-participant-search");
    expect(search).toHaveAttribute("name", "participantQuery");
    await user.type(search, "마지막");

    expect(screen.getByRole("listitem")).toHaveTextContent("마지막 참가자");
    expect(screen.getByText("1 / 1명 표시 중")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "참가자 검색" }));
    await user.click(screen.getByRole("button", { name: "미입장 32" }));
    const filteredList = screen.getByRole("list", { name: "체크인 참가자 목록" });
    expect(within(filteredList).getAllByRole("listitem")).toHaveLength(32);
    expect(within(filteredList).getAllByText("미입장")).toHaveLength(32);
  });

  it("serves lazy decoded DOPA thumbnails instead of full profile originals", async () => {
    const view = renderPage();

    await screen.findByText("참가자 1");
    const image = view.container.querySelector("img[src*='user-0.jpg']");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute(
      "src",
      "https://media.dopa.ing/t/width=80,quality=72,format=webp,fit=scale-down/profiles/user-0.jpg",
    );
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("alt", "");
  });

  it("clears a manual check-in failure before another participant is selected", async () => {
    mocks.checkInManually.mockRejectedValueOnce(new Error("첫 체크인 실패"));
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("list", { name: "체크인 참가자 목록" });
    const checkInButtons = within(list).getAllByRole("button", { name: "입장처리" });
    await user.click(checkInButtons[0]);
    let dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "입장처리" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("첫 체크인 실패");

    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    await user.click(checkInButtons[1]);
    dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a recoverable non-modal error when the scanner chunk fails", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<QrScannerLoadState error={new Error("chunk failed")} retry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("QR 스캐너를 불러오지 못했습니다");
    await user.click(screen.getByRole("button", { name: "QR 스캐너 다시 불러오기" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
