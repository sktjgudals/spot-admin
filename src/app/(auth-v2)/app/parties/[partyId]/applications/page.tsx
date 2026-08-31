"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, RefreshCw, Star, UserRound } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DopaMediaImage } from "@/components/ui/dopa-media-image";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import {
  businessOperatorQueryKeys,
  getOperatorPartyApplicants,
  getOperatorPartyDetail,
  reviewPartyApplication,
  type OperatorPartyApplicant,
  type OperatorPartyApplicants,
} from "@/auth/api/business-operator.api";
import { MobilePartyHeader } from "@/components/business-mobile/MobilePartyHeader";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const APPLICATION_WINDOW_SIZE = 40;

export default function PartyApplicationsPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <Applications />
    </RoleGuard>
  );
}
function Applications() {
  const partyId = String(useParams().partyId ?? "");
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<OperatorPartyApplicant | null>(null);
  const [selectedApplicant, setSelectedApplicant] = useState<OperatorPartyApplicant | null>(null);
  const [visibleCount, setVisibleCount] = useState(APPLICATION_WINDOW_SIZE);
  const applicantItemRefs = useRef(new Map<string, HTMLLIElement>());
  const pendingFocusApplicantIdRef = useRef<string | null>(null);
  const party = useQuery({
    queryKey: businessOperatorQueryKeys.party(partyId),
    queryFn: () => getOperatorPartyDetail(partyId),
    enabled: partyId.length > 0,
  });
  const applicantQuery = useQuery({
    queryKey: businessOperatorQueryKeys.applicants(partyId),
    queryFn: () => getOperatorPartyApplicants(partyId),
    enabled: partyId.length > 0,
  });
  const mutation = useMutation({
    mutationFn: reviewPartyApplication,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: businessOperatorQueryKeys.applicants(partyId),
      });
      setRejecting(null);
      setSelectedApplicant((current) =>
        current?.applicationId === variables.applicationId ? null : current,
      );
      toast.success(
        variables.status === "APPROVED"
          ? "파티 참여를 승인했습니다."
          : "파티 참여를 거절했습니다.",
      );
    },
    onError: (failure) => toast.error(failure instanceof Error ? failure.message : "처리하지 못했습니다."),
  });

  const applicants =
    applicantQuery.data?.applicants.filter((applicant) => applicant.status === "PENDING") ?? [];
  const maleCount = applicants.filter((applicant) => applicant.gender === "MALE").length;
  const femaleCount = applicants.filter((applicant) => applicant.gender === "FEMALE").length;
  const visibleApplicants = applicants.slice(0, visibleCount);
  const isLoading = party.isLoading || applicantQuery.isLoading;
  const error = party.error ?? applicantQuery.error;
  const isFetching = party.isFetching || applicantQuery.isFetching;

  useEffect(() => {
    const applicantId = pendingFocusApplicantIdRef.current;
    if (!applicantId) return;
    const item = applicantItemRefs.current.get(applicantId);
    if (!item) return;
    item.focus();
    pendingFocusApplicantIdRef.current = null;
  }, [visibleApplicants]);

  return (
    <div className="min-h-dvh bg-background pb-8 font-pretendard">
      <MobilePartyHeader
        title="파티 신청자 현황"
        partyTitle={party.data?.title}
        location={party.data?.location}
        startsAt={party.data?.startsAt ?? party.data?.date}
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid grid-cols-3 gap-2" aria-label="대기 신청자 요약">
          <Metric label="전체" value={applicants.length} primary />
          <Metric label="남자" value={maleCount} />
          <Metric label="여자" value={femaleCount} />
        </section>

        {applicantQuery.data?.truncated ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground"
          >
            신청자가 많아 최신 최대 100명만 표시합니다. 이 화면의 합계는 전체 신청자 수가
            아닐 수 있습니다.
          </div>
        ) : null}

        {isLoading && (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="신청자를 불러오는 중" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-2xl border bg-muted" />
            ))}
          </div>
        )}
        {error && (
          <div className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <div>
              <p className="font-medium text-destructive">신청자 목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11"
                disabled={isFetching}
                onClick={() => {
                  void party.refetch();
                  void applicantQuery.refetch();
                }}
              >
                <RefreshCw className={isFetching ? "animate-spin" : undefined} />
                다시 시도
              </Button>
            </div>
          </div>
        )}
        {!isLoading && !error && applicants.length === 0 && (
          <section className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-dashed bg-muted/20 text-center text-sm text-muted-foreground">
            대기 중인 신청자가 없어요.
          </section>
        )}
        {!isLoading && !error && applicants.length > 0 && (
          <>
          <p className="mt-5 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {Math.min(visibleCount, applicants.length)} / {applicants.length}명 표시 중
          </p>
          <ul className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="대기 신청자 목록">
            {visibleApplicants.map((applicant) => (
              <li
                key={applicant.applicationId}
                ref={(node) => {
                  if (node) {
                    applicantItemRefs.current.set(applicant.applicationId, node);
                  } else {
                    applicantItemRefs.current.delete(applicant.applicationId);
                  }
                }}
                tabIndex={-1}
                className="rounded-2xl outline-none focus:ring-3 focus:ring-ring"
              >
                <article className="h-full rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid size-13 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
                      {applicant.profileImage ? (
                        <DopaMediaImage
                          src={applicant.profileImage}
                          transformWidth={80}
                          alt={`${applicant.nickname} 프로필`}
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">대기</span>
                        <strong className="truncate text-base">{applicant.nickname}</strong>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {applicant.gender === "MALE"
                          ? "남자"
                          : applicant.gender === "FEMALE"
                            ? "여자"
                            : "성별 미입력"}
                        {applicant.birthYear
                          ? ` · ${new Date().getFullYear() - applicant.birthYear}세(${applicant.birthYear}년생)`
                          : " · 출생연도 미입력"}
                      </p>
                      <time
                        dateTime={applicant.appliedAt}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        신청 {DATE_TIME_FORMATTER.format(new Date(applicant.appliedAt))}
                      </time>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 min-h-11 w-full"
                    aria-label={`${applicant.nickname} 신청서 보기`}
                    onClick={() => setSelectedApplicant(applicant)}
                  >
                    <FileText aria-hidden />
                    신청서 보기
                  </Button>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      aria-label={`${applicant.nickname} 참여 거절`}
                      onClick={() => setRejecting(applicant)}
                    >
                      거절
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      aria-label={`${applicant.nickname} 참여 승인`}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ partyId, applicationId: applicant.applicationId, status: "APPROVED" })}
                    >
                      승인
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {visibleApplicants.length < applicants.length ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 min-w-40"
                onClick={() => {
                  pendingFocusApplicantIdRef.current =
                    applicants[visibleApplicants.length]?.applicationId ?? null;
                  setVisibleCount((current) => current + APPLICATION_WINDOW_SIZE);
                }}
              >
                신청자 더 보기
              </Button>
            </div>
          ) : null}
          </>
        )}
      </main>

      <ApplicantDetailSheet
        applicant={selectedApplicant}
        questions={applicantQuery.data?.formQuestions ?? []}
        pending={mutation.isPending}
        onOpenChange={(open) => {
          if (!open) setSelectedApplicant(null);
        }}
        onApprove={(applicant) =>
          mutation.mutate({
            partyId,
            applicationId: applicant.applicationId,
            status: "APPROVED",
          })
        }
        onReject={(applicant) => {
          setSelectedApplicant(null);
          setRejecting(applicant);
        }}
      />

      {rejecting ? (
        <RejectApplicationDialog
          key={rejecting.applicationId}
          applicant={rejecting}
          pending={mutation.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) =>
            mutation.mutate({
              partyId,
              applicationId: rejecting.applicationId,
              status: "REJECTED",
              reason,
            })
          }
        />
      ) : null}
    </div>
  );
}

type ApplicantQuestion = OperatorPartyApplicants["formQuestions"][number];

function RejectApplicationDialog({
  applicant,
  pending,
  onClose,
  onConfirm,
}: {
  applicant: OperatorPartyApplicant;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>[{applicant.nickname}]님의 파티 참여를 거절할까요?</DialogTitle>
          <DialogDescription>거절 사유는 신청자에게 안내됩니다.</DialogDescription>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="거절 사유를 입력해주세요."
          className="mobile-input min-h-[108px] resize-none py-3"
          maxLength={500}
          aria-label="거절 사유"
        />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={trimmedReason.length === 0 || pending}
            aria-label={`${applicant.nickname} 참여 거절 확정`}
            onClick={() => onConfirm(trimmedReason)}
          >
            거절
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicantDetailSheet({
  applicant,
  questions,
  pending,
  onOpenChange,
  onApprove,
  onReject,
}: {
  applicant: OperatorPartyApplicant | null;
  questions: ApplicantQuestion[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (applicant: OperatorPartyApplicant) => void;
  onReject: (applicant: OperatorPartyApplicant) => void;
}) {
  const answers = new Map(applicant?.formAnswers.map((answer) => [answer.fieldId, answer.value]));
  return (
    <Sheet open={applicant !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="border-b pr-14">
          <SheetTitle>{applicant?.nickname ?? "신청자"} 신청서</SheetTitle>
          <SheetDescription>
            등록 프로필, 파티 질문 답변과 공유된 운영 리뷰를 함께 확인합니다.
          </SheetDescription>
        </SheetHeader>
        {applicant ? (
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-4 pb-6">
            <section aria-labelledby="applicant-profile-title">
              <h2 id="applicant-profile-title" className="text-sm font-semibold">등록 프로필</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4">
                {profileRows(applicant).map(({ label, value, wide }) => (
                  <div key={label} className={wide ? "col-span-2" : undefined}>
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
              {!applicant.isProfilePublic ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  신청자는 다른 참가자에게 프로필을 공개하지 않도록 설정했습니다.
                </p>
              ) : null}
            </section>

            <section aria-labelledby="application-answers-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="application-answers-title" className="text-sm font-semibold">파티 신청 질문</h2>
                <span className="text-xs text-muted-foreground">{questions.length}개 질문</span>
              </div>
              {questions.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  이 파티에는 추가 신청 질문이 없습니다.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {questions.map((question, index) => {
                    const value = answers.get(question.fieldId);
                    const images = question.type === "IMAGE" ? answerImageUrls(value) : [];
                    return (
                      <li key={question.fieldId} className="rounded-xl border bg-card p-4">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {question.label}
                              {question.required ? <span className="ml-1 text-destructive" aria-label="필수 질문">*</span> : null}
                            </p>
                            {question.type === "IMAGE" ? (
                              images.length > 0 ? (
                                <ul className="mt-3 grid grid-cols-2 gap-2" aria-label={`${question.label} 답변 이미지`}>
                                  {images.map((url, imageIndex) => (
                                    <li key={url}>
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="block overflow-hidden rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring"
                                        aria-label={`${question.label} ${imageIndex + 1} 크게 보기`}
                                      >
                                        <DopaMediaImage
                                          src={url}
                                          transformWidth={320}
                                          alt={`${question.label} ${imageIndex + 1}`}
                                          className="aspect-square w-full bg-muted object-cover"
                                        />
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">미입력</p>
                              )
                            ) : (
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                                {displayValue(value)}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section aria-labelledby="shared-reviews-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="shared-reviews-title" className="text-sm font-semibold">공유 운영 리뷰</h2>
                <span className="text-xs text-muted-foreground">{applicant.sharedReviews.length}건</span>
              </div>
              {applicant.sharedReviews.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  공유된 과거 리뷰가 없습니다.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {applicant.sharedReviews.map((review) => (
                    <li key={review.id} className="rounded-xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{review.partyTitle}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{review.businessName}</p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold" aria-label={`평점 ${review.score}점`}>
                          <Star className="size-4 fill-warning text-warning" aria-hidden />
                          {review.score}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm">{displayValue(review.memo)}</p>
                      <time dateTime={review.createdAt} className="mt-2 block text-xs text-muted-foreground">
                        {DATE_TIME_FORMATTER.format(new Date(review.createdAt))}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
        <SheetFooter className="border-t bg-background">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!applicant || pending}
              aria-label={applicant ? `${applicant.nickname} 거절 사유 입력` : undefined}
              onClick={() => applicant && onReject(applicant)}
            >
              거절 사유 입력
            </Button>
            <Button
              type="button"
              disabled={!applicant || pending}
              aria-label={applicant ? `${applicant.nickname} 참여 승인` : undefined}
              onClick={() => applicant && onApprove(applicant)}
            >
              참여 승인
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function profileRows(applicant: OperatorPartyApplicant) {
  return [
    { label: "성별", value: applicant.gender === "MALE" ? "남자" : applicant.gender === "FEMALE" ? "여자" : "미입력" },
    { label: "출생 정보", value: displayValue(applicant.birthDate ?? applicant.birthYear) },
    { label: "연락처", value: displayValue(applicant.phone) },
    { label: "거주 지역", value: displayValue(applicant.city) },
    { label: "직업", value: displayValue(applicant.occupation) },
    { label: "회사", value: displayValue(applicant.company) },
    { label: "학력", value: displayValue(applicant.education) },
    { label: "키", value: applicant.height == null ? "미입력" : `${applicant.height}cm` },
    { label: "몸무게", value: applicant.weight == null ? "미입력" : `${applicant.weight}kg` },
    { label: "MBTI", value: displayValue(applicant.mbti) },
    { label: "인스타그램", value: displayValue(applicant.instagramId) },
    { label: "흡연", value: profileEnumLabel(applicant.smokingStatus) },
    { label: "음주", value: profileEnumLabel(applicant.drinkingStatus) },
    { label: "혼인 상태", value: profileEnumLabel(applicant.maritalStatus) },
    { label: "프로필 공개 설정", value: applicant.isProfilePublic ? "공개" : "비공개" },
    { label: "자기소개", value: displayValue(applicant.bio), wide: true },
  ];
}

const PROFILE_ENUM_LABELS: Record<string, string> = {
  NON_SMOKER: "비흡연",
  SMOKER: "흡연",
  NEVER: "안 함",
  SOMETIMES: "가끔",
  OFTEN: "자주",
  SINGLE: "미혼",
  MARRIED: "기혼",
  DIVORCED: "이혼",
};

function profileEnumLabel(value: string | null): string {
  return value ? (PROFILE_ENUM_LABELS[value] ?? value) : "미입력";
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "미입력";
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(", ") : "미입력";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function answerImageUrls(value: unknown): string[] {
  let candidates: unknown = value;
  if (typeof value === "string") {
    try {
      candidates = JSON.parse(value) as unknown;
    } catch {
      candidates = [];
    }
  }
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (typeof candidate !== "string") return [];
    try {
      const url = new URL(candidate);
      const allowedHost = url.hostname === "media.dopa.ing" || url.hostname === "media-staging.dopa.ing";
      return url.protocol === "https:" && allowedHost && !url.port ? [url.href] : [];
    } catch {
      return [];
    }
  });
}

function Metric({ label, value, primary = false }: { label: string; value: number; primary?: boolean }) {
  return (
    <div className={primary ? "rounded-xl bg-secondary px-3 py-3 text-secondary-foreground" : "rounded-xl border bg-card px-3 py-3 text-card-foreground"}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
