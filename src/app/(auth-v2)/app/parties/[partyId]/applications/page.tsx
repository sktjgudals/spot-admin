"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, UserRound } from "lucide-react";
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
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import {
  businessOperatorQueryKeys,
  getOperatorPartyDetail,
  reviewPartyApplication,
  type PendingApplication,
} from "@/auth/api/business-operator.api";
import { MobilePartyHeader } from "@/components/business-mobile/MobilePartyHeader";

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
  const [rejecting, setRejecting] = useState<PendingApplication | null>(null);
  const [reason, setReason] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: businessOperatorQueryKeys.party(partyId),
    queryFn: () => getOperatorPartyDetail(partyId),
    enabled: partyId.length > 0,
  });
  const mutation = useMutation({
    mutationFn: reviewPartyApplication,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: businessOperatorQueryKeys.party(partyId) });
      setRejecting(null);
      setReason("");
      toast.success(
        variables.status === "APPROVED"
          ? "파티 참여를 승인했습니다."
          : "파티 참여를 거절했습니다.",
      );
    },
    onError: (failure) => toast.error(failure instanceof Error ? failure.message : "처리하지 못했습니다."),
  });

  const applicants = data?.pendingApplications ?? [];
  const maleCount = applicants.filter((applicant) => applicant.gender === "MALE").length;
  const femaleCount = applicants.filter((applicant) => applicant.gender === "FEMALE").length;
  return (
    <div className="font-pretendard min-h-dvh bg-white pb-8">
      <MobilePartyHeader
        title="파티 신청자 현황"
        partyTitle={data?.title}
        location={data?.location}
        startsAt={data?.startsAt ?? data?.date}
      />
      <div className="flex gap-4 px-4 pt-2 text-[16px]" role="tablist" aria-label="신청자 성별">
        <span className="border-b-2 border-[#2d2d2d] px-2 pb-3 font-bold">
          전체 {applicants.length}
        </span>
        <span className="px-1 pb-3 text-[#8f8f8f]">남자 {maleCount}</span>
        <span className="px-1 pb-3 text-[#8f8f8f]">여자 {femaleCount}</span>
      </div>

      {isLoading && <p className="py-20 text-center text-[14px] text-[#686868]">불러오는 중…</p>}
      {error && <p className="px-4 py-20 text-center text-[14px] text-red-600">{error.message}</p>}
      {!isLoading && !error && applicants.length === 0 && (
        <p className="py-24 text-center text-[14px] text-[#686868]">대기 중인 신청자가 없어요.</p>
      )}
      <div className="divide-y divide-[#f5f5f5]">
        {applicants.map((applicant) => (
          <article key={applicant.applicationId} className="px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="grid size-[50px] shrink-0 place-items-center overflow-hidden rounded-full border border-[#dedede] bg-[#f5f5f5] text-[#b8b8b8]">
                {applicant.profileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- runtime user media URL.
                  <img src={applicant.profileImage} alt="" className="size-full object-cover" />
                ) : (
                  <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-[#f0e9fc] px-3 py-1 text-[12px] text-[#9c6cf2]">대기</span>
                  <strong className="truncate text-[16px]">{applicant.nickname}</strong>
                </div>
                <p className="mt-1 text-[14px] text-[#686868]">
                  {applicant.gender === "MALE" ? "남자" : applicant.gender === "FEMALE" ? "여자" : "프로필"}
                  {applicant.birthYear ? ` · ${new Date().getFullYear() - applicant.birthYear}세(${applicant.birthYear}년생)` : applicant.averageRating != null ? ` · 평점 ${applicant.averageRating.toFixed(1)}` : ""}
                </p>
              </div>
              <ChevronRight className="size-5 text-[#8f8f8f]" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRejecting(applicant)}
                className="h-10 rounded-xl border border-[#dedede] text-[14px] text-[#686868]"
              >
                거절
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ partyId, applicationId: applicant.applicationId, status: "APPROVED" })}
                className="h-10 rounded-xl bg-[#9c6cf2] text-[14px] text-white disabled:opacity-50"
              >
                승인
              </button>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={rejecting !== null} onOpenChange={(open) => { if (!open) setRejecting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              [{rejecting?.nickname}]님의 파티 참여를 거절할까요?
            </DialogTitle>
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
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>닫기</Button>
            <Button
              type="button"
              disabled={reason.trim().length === 0 || mutation.isPending}
              onClick={() =>
                rejecting &&
                mutation.mutate({
                  partyId,
                  applicationId: rejecting.applicationId,
                  status: "REJECTED",
                  reason: reason.trim(),
                })
              }
            >
              거절
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
