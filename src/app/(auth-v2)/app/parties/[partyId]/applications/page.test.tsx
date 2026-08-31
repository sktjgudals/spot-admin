import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApplicants: vi.fn(),
  getParty: vi.fn(),
  review: vi.fn(),
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
    getOperatorPartyApplicants: mocks.getApplicants,
    getOperatorPartyDetail: mocks.getParty,
    reviewPartyApplication: mocks.review,
  };
});

import PartyApplicationsPage from "./page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PartyApplicationsPage />
    </QueryClientProvider>,
  );
}

describe("PartyApplicationsPage", () => {
  beforeEach(() => {
    mocks.getParty.mockReset();
    mocks.getApplicants.mockReset();
    mocks.review.mockReset();
    mocks.getParty.mockResolvedValue({
      id: "party-1",
      title: "도파 소셜",
      location: "서울",
      date: "2026-09-01T10:00:00.000Z",
      startsAt: "2026-09-01T10:00:00.000Z",
      pendingApplications: [],
    });
    mocks.getApplicants.mockResolvedValue({
      truncated: true,
      formQuestions: [
        {
          fieldId: "motivation",
          label: "이 파티에 참여하고 싶은 이유",
          type: "TEXTAREA",
          imageMaxCount: null,
          required: true,
        },
        {
          fieldId: "photos",
          label: "본인 사진",
          type: "IMAGE",
          imageMaxCount: 2,
          required: false,
        },
      ],
      applicants: [
        {
          applicationId: "pending-1",
          userId: "user-1",
          nickname: "대기 신청자",
          profileImage: "https://cdn.example.test/profile.jpg",
          gender: "FEMALE",
          birthYear: 1998,
          status: "PENDING",
          participationStatus: "PENDING",
          appliedAt: "2026-08-31T01:00:00.000Z",
          birthDate: null,
          phone: null,
          bio: "새로운 사람을 만나는 것을 좋아해요.",
          city: "서울",
          occupation: "디자이너",
          company: null,
          education: null,
          height: null,
          weight: null,
          mbti: "ENFP",
          instagramId: null,
          smokingStatus: "NON_SMOKER",
          drinkingStatus: "SOMETIMES",
          maritalStatus: "SINGLE",
          isProfilePublic: false,
          formAnswers: [
            { fieldId: "motivation", value: "함께 즐거운 시간을 보내고 싶어요." },
            {
              fieldId: "photos",
              value: JSON.stringify(["https://media.dopa.ing/applications/photo-1.jpg"]),
            },
          ],
          sharedReviews: [
            {
              id: "review-1",
              businessId: "business-1",
              businessName: "도파 라운지",
              partyId: "old-party",
              partyTitle: "지난 소셜",
              score: 5,
              memo: "매너가 좋았어요.",
              tagIds: [],
              createdAt: "2026-08-01T01:00:00.000Z",
            },
          ],
        },
        {
          applicationId: "approved-1",
          userId: "user-2",
          nickname: "승인된 신청자",
          profileImage: null,
          gender: "MALE",
          birthYear: 1997,
          status: "APPROVED",
          participationStatus: "CONFIRMED",
          appliedAt: "2026-08-30T01:00:00.000Z",
          formAnswers: [],
          sharedReviews: [],
        },
      ],
    });
  });

  afterEach(cleanup);

  it("uses the dedicated applicant response, filters pending rows, and discloses truncation", async () => {
    renderPage();

    expect(await screen.findByText("대기 신청자")).toBeInTheDocument();
    expect(screen.queryByText("승인된 신청자")).not.toBeInTheDocument();
    const profileImage = screen.getByRole("img", { name: "대기 신청자 프로필" });
    expect(profileImage).toHaveAttribute("src", "https://cdn.example.test/profile.jpg");
    expect(profileImage).toHaveAttribute("loading", "lazy");
    expect(profileImage).toHaveAttribute("decoding", "async");
    expect(screen.getByText(/여자 · .*1998년생/u)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("최대 100명");
    const summary = screen.getByLabelText("대기 신청자 요약");
    expect(within(summary).getByText("전체").nextElementSibling).toHaveTextContent("1");
    expect(mocks.getApplicants).toHaveBeenCalledWith("party-1");
    expect(
      screen.getByRole("button", { name: "대기 신청자 참여 거절" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "대기 신청자 참여 승인" }),
    ).toBeInTheDocument();
  });

  it("shows profile, business-authored answers, image evidence and shared reviews before review", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "대기 신청자 신청서 보기" }));
    const detail = await screen.findByRole("dialog", { name: "대기 신청자 신청서" });
    expect(within(detail).getByText("이 파티에 참여하고 싶은 이유")).toBeInTheDocument();
    expect(within(detail).getByText("함께 즐거운 시간을 보내고 싶어요.")).toBeInTheDocument();
    expect(within(detail).getByRole("img", { name: "본인 사진 1" })).toHaveAttribute(
      "src",
      "https://media.dopa.ing/t/width=320,quality=72,format=webp,fit=scale-down/applications/photo-1.jpg",
    );
    expect(within(detail).getByText("지난 소셜")).toBeInTheDocument();
    expect(within(detail).getByText("매너가 좋았어요.")).toBeInTheDocument();
    expect(within(detail).getByText("연락처").parentElement).toHaveTextContent("미입력");
    expect(within(detail).getByText("프로필 공개 설정").parentElement).toHaveTextContent(
      "비공개",
    );
    expect(
      within(detail).getByRole("button", { name: "대기 신청자 거절 사유 입력" }),
    ).toBeInTheDocument();
    expect(
      within(detail).getByRole("button", { name: "대기 신청자 참여 승인" }),
    ).toBeInTheDocument();
  });

  it("caps the initial applicant DOM and progressively reveals the rest", async () => {
    mocks.getApplicants.mockResolvedValue({
      truncated: false,
      formQuestions: [],
      applicants: Array.from({ length: 45 }, (_, index) => ({
        applicationId: `application-${index}`,
        userId: `user-${index}`,
        nickname: `신청자 ${index + 1}`,
        profileImage: null,
        gender: null,
        birthYear: null,
        status: "PENDING",
        participationStatus: "PENDING",
        appliedAt: "2026-08-31T01:00:00.000Z",
        formAnswers: [],
        sharedReviews: [],
      })),
    });
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("list", { name: "대기 신청자 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(40);
    expect(screen.getByText("40 / 45명 표시 중")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "신청자 더 보기" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(45);
    expect(within(list).getAllByRole("listitem")[40]).toHaveFocus();
  });

  it("keeps rejection draft state inside the dialog and submits its trimmed reason", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("대기 신청자");
    await user.click(screen.getByRole("button", { name: "대기 신청자 참여 거절" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "거절 사유" }), "  일정 부적합  ");
    await user.click(
      within(dialog).getByRole("button", { name: "대기 신청자 참여 거절 확정" }),
    );

    expect(mocks.review.mock.calls[0]?.[0]).toEqual({
      partyId: "party-1",
      applicationId: "pending-1",
      status: "REJECTED",
      reason: "일정 부적합",
    });
  });
});
