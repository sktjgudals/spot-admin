"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, UserRound } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import {
  businessOperatorQueryKeys,
  checkInManually,
  getCheckInStatus,
  getOperatorPartyDetail,
  type CheckInParticipant,
} from "@/auth/api/business-operator.api";
import { MobilePartyHeader } from "@/components/business-mobile/MobilePartyHeader";

export default function PartyCheckInPage() {
  return (
    <RoleGuard allow={["BUSINESS_ADMIN"]}>
      <CheckIn />
    </RoleGuard>
  );
}
function CheckIn() {
  const partyId = String(useParams().partyId ?? "");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CheckInParticipant | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const party = useQuery({
    queryKey: businessOperatorQueryKeys.party(partyId),
    queryFn: () => getOperatorPartyDetail(partyId),
    enabled: partyId.length > 0,
  });
  const status = useQuery({
    queryKey: businessOperatorQueryKeys.checkIn(partyId),
    queryFn: () => getCheckInStatus(partyId),
    enabled: partyId.length > 0,
  });
  const mutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => checkInManually(partyId, userId),
    onSuccess: () => {
      const nickname = selected?.nickname ?? "참가자";
      setSelected(null);
      setNotice(`[${nickname}]님 파티 입장처리가 완료되었습니다.`);
      void queryClient.invalidateQueries({ queryKey: businessOperatorQueryKeys.checkIn(partyId) });
      window.setTimeout(() => setNotice(null), 3500);
    },
  });
  const participants = status.data?.participants ?? [];

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-24">
      <MobilePartyHeader
        title="QR 체크인"
        partyTitle={party.data?.title}
        location={party.data?.location}
        startsAt={party.data?.startsAt ?? party.data?.date}
      />
      <div className="flex gap-4 px-4 pt-2 text-[16px]">
        <span className="border-b-2 border-[#2d2d2d] px-2 pb-3 font-bold">전체 {status.data?.confirmedCount ?? 0}</span>
        <span className="px-1 pb-3 text-[#8f8f8f]">입장 {status.data?.checkedInCount ?? 0}</span>
        <span className="px-1 pb-3 text-[#8f8f8f]">미입장 {status.data?.notCheckedInCount ?? 0}</span>
      </div>
      {(party.isLoading || status.isLoading) && <p className="py-20 text-center text-[14px] text-[#686868]">불러오는 중…</p>}
      {(party.error || status.error) && <p className="px-4 py-16 text-center text-[14px] text-red-600">{party.error?.message ?? status.error?.message}</p>}
      <div className="divide-y divide-[#f5f5f5]">
        {participants.map((person) => (
          <article key={person.userId} className="flex items-center gap-3 px-4 py-4">
            <div className="grid size-[50px] shrink-0 place-items-center overflow-hidden rounded-full border border-[#dedede] bg-[#f5f5f5] text-[#b8b8b8]">
              {person.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- runtime user media URL.
                <img src={person.profileImage} alt="" className="size-full object-cover" />
              ) : (
                <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={person.checkedIn ? "rounded-lg bg-[#f5f5f5] px-3 py-1 text-[12px] text-[#686868]" : "rounded-lg bg-[#f0e9fc] px-3 py-1 text-[12px] text-[#9c6cf2]"}>
                  {person.checkedIn ? "입장" : "미입장"}
                </span>
                <strong className="truncate text-[16px]">{person.nickname}</strong>
              </div>
              <p className="mt-1 text-[14px] text-[#686868]">
                {person.gender === "MALE" ? "남자" : person.gender === "FEMALE" ? "여자" : "참가자"}
                {person.birthYear ? ` · ${new Date().getFullYear() - person.birthYear}세(${person.birthYear}년생)` : ""}
              </p>
            </div>
            {person.checkedIn ? (
              <ChevronRight className="size-5 text-[#8f8f8f]" />
            ) : (
              <button type="button" onClick={() => setSelected(person)} className="h-10 rounded-xl border border-[#9c6cf2] px-4 text-[14px] text-[#7144c2]">
                입장처리
              </button>
            )}
          </article>
        ))}
      </div>

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-32px)] max-w-[398px] -translate-x-1/2 items-center gap-2 rounded-xl bg-[#2d2d2d] px-4 py-3 text-[13px] text-white">
          <CheckCircle2 className="size-4 text-emerald-400" fill="currentColor" />
          <span>{notice}</span>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] bg-white px-4 pb-[max(15px,env(safe-area-inset-bottom))] pt-2">
        <button type="button" className="h-12 w-full rounded-xl bg-[#9c6cf2] text-[14px] text-white">QR 체크인</button>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35" role="dialog" aria-modal="true">
          <div className="w-full max-w-[430px] rounded-t-[24px] bg-white px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-7">
            <h2 className="text-center text-[18px] font-bold">[{selected.nickname}]님을 입장처리 할까요?</h2>
            {mutation.error && <p className="mt-3 text-center text-[13px] text-red-600">{mutation.error.message}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setSelected(null)} className="h-12 rounded-xl border border-[#dedede] text-[#686868]">닫기</button>
              <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ userId: selected.userId })} className="h-12 rounded-xl bg-[#9c6cf2] text-white disabled:opacity-50">입장처리</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
