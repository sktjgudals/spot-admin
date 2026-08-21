"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPartyStatusHistory,
  partyQueryKeys,
  transitionParty,
  type AdminParty,
  type PartyOperationalStatus,
} from "@/auth/api/admin-party.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const LABELS: Record<PartyOperationalStatus, string> = {
  DRAFT: "임시 저장",
  RECRUITING: "모집 중",
  CONFIRMED: "참가 확정",
  CHECKIN_OPEN: "체크인",
  LIVE: "진행 중",
  INTEREST_OPEN: "호감 선택",
  INTEREST_CLOSED: "호감 마감",
  MATCH_PENDING: "매칭 계산",
  MATCH_REVEALED: "매칭 공개",
  AFTER_PARTY: "애프터파티",
  COMPLETED: "종료",
  CANCELLED: "취소",
};

export function PartyStatusBadge({ status }: { status: PartyOperationalStatus }) {
  return <Badge variant={status === "COMPLETED" || status === "CANCELLED" ? "outline" : "default"}>{LABELS[status]}</Badge>;
}

export function PartyOperationsPanel({ party }: { party: AdminParty }) {
  const qc = useQueryClient();
  const { admin } = useAdminAuth();
  const scope = admin?.role === "SUPER_ADMIN" ? "super" : "business";
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<PartyOperationalStatus | null>(null);
  const history = useQuery({
    queryKey: partyQueryKeys.statusHistory(party.id),
    queryFn: () => getPartyStatusHistory(party.id, scope),
  });

  const run = async (toStatus: PartyOperationalStatus) => {
    if (toStatus === "CANCELLED" && !reason.trim()) {
      toast.error("취소 사유를 입력해 주세요");
      return;
    }
    if (!window.confirm(`상태를 「${LABELS[toStatus]}」(으)로 변경할까요?`)) return;
    setPending(toStatus);
    try {
      const updated = await transitionParty(party.id, {
        toStatus,
        expectedVersion: party.operationalVersion,
        idempotencyKey: `admin-web:${party.id}:${party.operationalVersion}:${toStatus}:${crypto.randomUUID()}`,
        reason: reason.trim() || undefined,
      }, scope);
      qc.setQueryData(partyQueryKeys.detail(party.id), updated);
      await Promise.all([
        qc.invalidateQueries({ queryKey: partyQueryKeys.all }),
        history.refetch(),
      ]);
      setReason("");
      toast.success(`상태가 ${LABELS[toStatus]}(으)로 변경되었습니다`);
    } catch (error) {
      toast.error(error instanceof AdminAuthError ? error.message : "상태 변경에 실패했습니다");
      await qc.invalidateQueries({ queryKey: partyQueryKeys.detail(party.id) });
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>파티 운영 상태</CardTitle>
          <PartyStatusBadge status={party.operationalStatus} />
          <span className="text-xs text-muted-foreground">v{party.operationalVersion}</span>
        </div>
        <CardDescription>
          {new Date(party.startsAt).toLocaleString()} → {new Date(party.endsAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {party.allowedTransitions.includes("CANCELLED") && (
          <Textarea
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="취소 또는 수동 종료 사유 (취소 시 필수)"
          />
        )}
        <div className="flex flex-wrap gap-2">
          {party.allowedTransitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">종료 상태이므로 추가 전이가 없습니다.</p>
          ) : (
            party.allowedTransitions.map((status) => (
              <Button
                key={status}
                type="button"
                variant={status === "CANCELLED" ? "destructive" : "outline"}
                disabled={pending !== null}
                onClick={() => void run(status)}
              >
                {pending === status ? "처리 중…" : LABELS[status]}
              </Button>
            ))
          )}
        </div>
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">상태 이력</h3>
          {history.isLoading && <p className="text-xs text-muted-foreground">불러오는 중…</p>}
          {history.isError && <p className="text-xs text-destructive">이력을 불러오지 못했습니다.</p>}
          {history.data?.length === 0 && <p className="text-xs text-muted-foreground">아직 전이 이력이 없습니다.</p>}
          {history.data?.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">v{item.version}</span>
              <span>{LABELS[item.fromStatus]} → {LABELS[item.toStatus]}</span>
              <span className="text-muted-foreground">{item.actorType} · {new Date(item.createdAt).toLocaleString()}</span>
              {item.reason && <span className="text-muted-foreground">{item.reason}</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
