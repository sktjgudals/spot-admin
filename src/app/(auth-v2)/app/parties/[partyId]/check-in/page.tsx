"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, ScanLine, Search, UserRound } from "lucide-react";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { BUSINESS_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import {
  businessOperatorQueryKeys,
  checkInByQr,
  checkInManually,
  getCheckInStatus,
  getOperatorPartyDetail,
  type CheckInParticipant,
} from "@/auth/api/business-operator.api";
import { MobilePartyHeader } from "@/components/business-mobile/MobilePartyHeader";
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

const CHECK_IN_PAGE_SIZE = 60;
const EMPTY_PARTICIPANTS: CheckInParticipant[] = [];
type AttendanceFilter = "ALL" | "CHECKED_IN" | "NOT_CHECKED_IN";

const CheckInQrScanner = dynamic(
  () =>
    import("@/components/business-mobile/CheckInQrScanner").then(
      (module) => module.CheckInQrScanner,
    ),
  {
    ssr: false,
    loading: QrScannerLoadState,
  },
);

export function QrScannerLoadState({
  error,
  retry,
}: {
  error?: Error | null;
  retry?: () => void;
}) {
  if (error) {
    return (
      <div
        className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
        role="alert"
      >
        <span>QR 스캐너를 불러오지 못했습니다.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 shrink-0"
          onClick={retry}
        >
          QR 스캐너 다시 불러오기
        </Button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-32px)] max-w-sm -translate-x-1/2 items-center gap-2 rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
      role="status"
      aria-live="polite"
    >
      <RefreshCw className="size-4 animate-spin" aria-hidden />
      QR 스캐너 준비 중…
    </div>
  );
}

export default function PartyCheckInPage() {
  return (
    <RoleGuard allow={BUSINESS_ADMIN_ONLY}>
      <CheckIn />
    </RoleGuard>
  );
}
function CheckIn() {
  const partyId = String(useParams().partyId ?? "");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CheckInParticipant | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("ALL");
  const participantRefs = useRef(new Map<string, HTMLLIElement>());
  const pendingFocusParticipantId = useRef<string | null>(null);
  const [visibleWindow, setVisibleWindow] = useState({
    key: "",
    count: CHECK_IN_PAGE_SIZE,
  });
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
  const participants = status.data?.participants ?? EMPTY_PARTICIPANTS;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
  const visibleWindowKey = `${partyId}\u0000${attendanceFilter}\u0000${normalizedSearchQuery}`;
  const visibleCount =
    visibleWindow.key === visibleWindowKey
      ? visibleWindow.count
      : CHECK_IN_PAGE_SIZE;
  const filteredParticipants = useMemo(() => {
    return participants.filter((person) => {
      if (attendanceFilter === "CHECKED_IN" && !person.checkedIn) return false;
      if (attendanceFilter === "NOT_CHECKED_IN" && person.checkedIn) return false;
      return (
        normalizedSearchQuery.length === 0 ||
        person.nickname.toLocaleLowerCase("ko-KR").includes(normalizedSearchQuery)
      );
    });
  }, [attendanceFilter, normalizedSearchQuery, participants]);
  const visibleParticipants = filteredParticipants.slice(0, visibleCount);
  useEffect(() => {
    const userId = pendingFocusParticipantId.current;
    if (!userId) return;

    const participant = participantRefs.current.get(userId);
    if (!participant) return;

    participant.focus();
    pendingFocusParticipantId.current = null;
  }, [selected, visibleParticipants]);

  const mutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => checkInManually(partyId, userId),
    onSuccess: () => {
      const nickname = selected?.nickname ?? "참가자";
      pendingFocusParticipantId.current = selected?.userId ?? null;
      setSelected(null);
      setNotice(`[${nickname}]님 파티 입장처리가 완료되었습니다.`);
      void queryClient.invalidateQueries({ queryKey: businessOperatorQueryKeys.checkIn(partyId) });
      window.setTimeout(() => setNotice(null), 3500);
    },
  });
  const qrMutation = useMutation({
    mutationFn: (token: string) => checkInByQr(partyId, token),
    onSuccess: (result) => {
      const nickname = participants.find((person) => person.userId === result.userId)?.nickname;
      setQrOpen(false);
      setNotice(
        result.replay
          ? `${nickname ? `[${nickname}]님은` : "이 참가자는"} 이미 입장 처리되었습니다.`
          : `${nickname ? `[${nickname}]님` : "참가자"} 파티 입장처리가 완료되었습니다.`,
      );
      void queryClient.invalidateQueries({ queryKey: businessOperatorQueryKeys.checkIn(partyId) });
      window.setTimeout(() => setNotice(null), 3500);
    },
  });

  return (
    <div className="min-h-dvh bg-background pb-28 font-pretendard md:pb-24">
      <MobilePartyHeader
        title="QR 체크인"
        partyTitle={party.data?.title}
        location={party.data?.location}
        startsAt={party.data?.startsAt ?? party.data?.date}
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid grid-cols-3 gap-2" aria-label="체크인 요약">
          <Metric label="전체" value={status.data?.confirmedCount ?? 0} />
          <Metric label="입장" value={status.data?.checkedInCount ?? 0} positive />
          <Metric label="미입장" value={status.data?.notCheckedInCount ?? 0} primary />
        </section>
        {status.data?.truncated ? (
          <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground" role="alert">
            API 결과가 최대 500명으로 제한되어 일부 참가자가 표시되지 않을 수 있습니다.
            필요한 참가자가 보이지 않으면 운영 채널로 확인해 주세요.
          </p>
        ) : null}
        {(party.isLoading || status.isLoading) && (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="참가자를 불러오는 중" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border bg-muted" />
            ))}
          </div>
        )}
        {(party.error || status.error) && (
          <div className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <div>
              <p className="font-medium text-destructive">체크인 현황을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">{party.error?.message ?? status.error?.message}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11"
                disabled={party.isFetching || status.isFetching}
                onClick={() => {
                  void party.refetch();
                  void status.refetch();
                }}
              >
                <RefreshCw className={party.isFetching || status.isFetching ? "animate-spin" : undefined} />
                다시 시도
              </Button>
            </div>
          </div>
        )}
        {!party.isLoading && !status.isLoading && !party.error && !status.error && participants.length === 0 && (
          <section className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-dashed bg-muted/20 px-5 text-center">
            <div>
              <ScanLine className="mx-auto size-9 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">체크인할 참가자가 없습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">승인된 참가자가 생기면 이곳에 표시됩니다.</p>
            </div>
          </section>
        )}
        {!party.isLoading && !status.isLoading && !party.error && !status.error && participants.length > 0 && (
          <>
            <section className="mt-5 rounded-2xl border bg-card p-3 shadow-sm sm:p-4" aria-label="체크인 참가자 필터">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative min-w-0 flex-1 lg:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    id="check-in-participant-search"
                    name="participantQuery"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-label="참가자 검색"
                    placeholder="닉네임 검색"
                    autoComplete="off"
                    className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="입장 상태 필터">
                  <AttendanceFilterButton
                    label={`전체 ${participants.length}`}
                    active={attendanceFilter === "ALL"}
                    onClick={() => setAttendanceFilter("ALL")}
                  />
                  <AttendanceFilterButton
                    label={`입장 ${status.data?.checkedInCount ?? 0}`}
                    active={attendanceFilter === "CHECKED_IN"}
                    onClick={() => setAttendanceFilter("CHECKED_IN")}
                  />
                  <AttendanceFilterButton
                    label={`미입장 ${status.data?.notCheckedInCount ?? 0}`}
                    active={attendanceFilter === "NOT_CHECKED_IN"}
                    onClick={() => setAttendanceFilter("NOT_CHECKED_IN")}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {Math.min(visibleCount, filteredParticipants.length)} / {filteredParticipants.length}명 표시 중
              </p>
            </section>
            {filteredParticipants.length === 0 ? (
              <section className="mt-4 grid min-h-48 place-items-center rounded-2xl border border-dashed bg-muted/20 px-5 text-center" role="status">
                <div>
                  <Search className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-3 font-medium">조건에 맞는 참가자가 없습니다.</p>
                  <p className="mt-1 text-sm text-muted-foreground">검색어나 입장 상태를 다시 확인해 주세요.</p>
                </div>
              </section>
            ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="체크인 참가자 목록">
            {visibleParticipants.map((person) => (
              <li
                key={person.userId}
                tabIndex={-1}
                ref={(node) => {
                  if (node) participantRefs.current.set(person.userId, node);
                  else participantRefs.current.delete(person.userId);
                }}
              >
                <article className="flex h-full min-h-28 items-center gap-3 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
                  <div className="grid size-13 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
                    {person.profileImage ? (
                      <DopaMediaImage
                        src={person.profileImage}
                        transformWidth={80}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserRound className="size-7" fill="currentColor" strokeWidth={1.2} aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={person.checkedIn ? "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground" : "rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"}>
                        {person.checkedIn ? "입장" : "미입장"}
                      </span>
                      <strong className="truncate text-base">{person.nickname}</strong>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {person.gender === "MALE" ? "남자" : person.gender === "FEMALE" ? "여자" : "프로필 미입력"}
                      {person.birthYear ? ` · ${new Date().getFullYear() - person.birthYear}세(${person.birthYear}년생)` : ""}
                    </p>
                  </div>
                  {!person.checkedIn ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 shrink-0 border-primary text-primary"
                      onClick={() => {
                        mutation.reset();
                        setSelected(person);
                      }}
                    >
                      입장처리
                    </Button>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
            )}
            {visibleParticipants.length < filteredParticipants.length ? (
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 min-w-40"
                  onClick={() => {
                    pendingFocusParticipantId.current =
                      filteredParticipants[visibleCount]?.userId ?? null;
                    setVisibleWindow({
                      key: visibleWindowKey,
                      count: visibleCount + CHECK_IN_PAGE_SIZE,
                    })
                  }}
                >
                  참가자 더 보기
                </Button>
              </div>
            ) : null}
          </>
        )}
      </main>

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-32px)] max-w-lg -translate-x-1/2 items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg" role="status" aria-live="polite">
          <CheckCircle2 className="size-4 text-background" fill="currentColor" aria-hidden />
          <span>{notice}</span>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t bg-background/95 px-4 pb-[max(15px,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:px-6 md:bottom-4 md:rounded-2xl md:border md:pb-3 md:shadow-lg">
        <Button
          type="button"
          className="min-h-12 w-full"
          aria-pressed={qrOpen}
          onClick={() => {
            qrMutation.reset();
            setQrOpen((open) => !open);
          }}
        >
          <ScanLine aria-hidden />
          {qrOpen ? "QR 스캐너 닫기" : "QR 체크인"}
        </Button>
      </div>
      {qrOpen ? (
        <CheckInQrScanner
          open
          pending={qrMutation.isPending}
          error={qrMutation.error instanceof Error ? qrMutation.error.message : null}
          onClose={() => {
            setQrOpen(false);
            qrMutation.reset();
          }}
          onToken={(token) => qrMutation.mutate(token)}
        />
      ) : null}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            mutation.reset();
            setSelected(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>[{selected?.nickname}]님을 입장처리 할까요?</DialogTitle>
            <DialogDescription>입장 처리는 즉시 반영됩니다.</DialogDescription>
          </DialogHeader>
          {mutation.error && (
            <p className="text-sm text-destructive" role="alert">{mutation.error.message}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                mutation.reset();
                setSelected(null);
              }}
            >
              닫기
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || !selected}
              onClick={() => selected && mutation.mutate({ userId: selected.userId })}
            >
              입장처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttendanceFilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-lg px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring sm:text-sm ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Metric({ label, value, primary = false, positive = false }: { label: string; value: number; primary?: boolean; positive?: boolean }) {
  const tone = positive
    ? "border-success/25 bg-success/10 text-foreground"
    : primary
      ? "bg-secondary text-secondary-foreground"
      : "border bg-card text-card-foreground";
  return (
    <div className={`rounded-xl px-3 py-3 ${tone}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
