"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  approveRefundPolicyRequest,
  getRefundPolicyRequest,
  listRefundPolicyRequests,
  refundPolicyRequestKeys,
  rejectRefundPolicyRequest,
  type RefundPolicyTier,
} from "@/auth/api/admin-refund-policy.api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Filter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

export default function RefundPolicyRequestsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("");

  const list = useQuery({
    queryKey: refundPolicyRequestKeys.list(filter),
    queryFn: () => listRefundPolicyRequests(filter),
  });
  const selected = useQuery({
    queryKey: refundPolicyRequestKeys.detail(selectedId ?? ""),
    queryFn: () => getRefundPolicyRequest(selectedId!),
    enabled: !!selectedId,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: refundPolicyRequestKeys.all,
    });
  };

  const approve = useMutation({
    mutationFn: () =>
      approveRefundPolicyRequest(selectedId!, reviewReason),
    onSuccess: async () => {
      toast.success("승인된 정책을 업체 활성 정책으로 적용했습니다.");
      setReviewReason("");
      setSelectedId(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reject = useMutation({
    mutationFn: () => {
      if (!reviewReason.trim()) {
        throw new Error("거절 사유를 입력해 주세요.");
      }
      return rejectRefundPolicyRequest(selectedId!, reviewReason);
    },
    onSuccess: async () => {
      toast.success("사유와 함께 변경안을 거절했습니다.");
      setReviewReason("");
      setSelectedId(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = list.data ?? [];
  const detail = selected.data;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">환불 정책 승인</h1>
        <p className="text-sm text-muted-foreground">
          업체 신청안은 SUPER_ADMIN 승인 후에만 활성화됩니다. 승인·거절은 감사 로그에
          기록됩니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as Filter[]).map(
          (status) => (
            <Button
              key={status}
              size="sm"
              variant={filter === status ? "default" : "outline"}
              onClick={() => {
                setFilter(status);
                setSelectedId(null);
              }}
            >
              {statusLabel(status)}
            </Button>
          ),
        )}
      </div>

      {list.isLoading && (
        <p className="text-sm text-muted-foreground">목록을 불러오는 중…</p>
      )}
      {list.isError && (
        <p className="text-sm text-destructive">{list.error.message}</p>
      )}
      {!list.isLoading && !list.isError && (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>업체</TableHead>
                <TableHead>신청자</TableHead>
                <TableHead>신청 사유</TableHead>
                <TableHead>단계</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>신청일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-10"
                  >
                    해당 요청이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((request) => (
                <TableRow
                  key={request.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedId(request.id);
                    setReviewReason("");
                  }}
                >
                  <TableCell className="font-medium">
                    {request.businessName}
                  </TableCell>
                  <TableCell>{request.requesterName ?? "—"}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {request.reason ?? "—"}
                  </TableCell>
                  <TableCell>{request.proposedTiers.length}개</TableCell>
                  <TableCell>
                    <StatusBadge status={request.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(request.createdAt).toLocaleString("ko-KR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">정책 비교·심사</CardTitle>
            <CardDescription>
              현재 정책과 신청안을 수치로 비교한 뒤 승인 또는 거절하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.isLoading && (
              <p className="text-sm text-muted-foreground">상세를 불러오는 중…</p>
            )}
            {selected.isError && (
              <p className="text-sm text-destructive">
                {selected.error.message}
              </p>
            )}
            {detail && (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <PolicyPanel
                    title="현재 승인 정책"
                    tiers={detail.current.tiers}
                  />
                  <PolicyPanel
                    title="업체 제안 정책"
                    tiers={detail.request.proposedTiers}
                  />
                </div>
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p>일반 취소에 적용되며 법정 청약철회·서비스 불이행 권리를 제한하지 않습니다.</p>
                  <p>사용자 화면에는 환불률과 취소수수료를 함께 고지합니다.</p>
                </div>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">업체:</span>{" "}
                    {detail.request.businessName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">신청 사유:</span>{" "}
                    {detail.request.reason ?? "—"}
                  </p>
                </div>
                {detail.request.status === "PENDING" && (
                  <>
                    <Textarea
                      value={reviewReason}
                      onChange={(event) => setReviewReason(event.target.value)}
                      placeholder="검토 메모 (거절 시 필수)"
                      maxLength={1000}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() => reject.mutate()}
                      >
                        사유와 함께 거절
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => approve.mutate()}
                      >
                        승인하고 활성화
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PolicyPanel({
  title,
  tiers,
}: {
  title: string;
  tiers: RefundPolicyTier[];
}) {
  const sorted = useMemo(
    () => [...tiers].sort((a, b) => b.hoursBeforeStart - a.hoursBeforeStart),
    [tiers],
  );
  return (
    <div className="rounded-md border p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2 text-sm">
        {sorted.map((tier) => (
          <div
            key={tier.hoursBeforeStart}
            className="flex items-center justify-between gap-3"
          >
            <span>
              {tier.hoursBeforeStart === 0
                ? "그 외"
                : `시작 ${tier.hoursBeforeStart}시간 전`}
            </span>
            <span className="font-medium">
              {tier.refundPercent}% 환불 · 취소수수료{" "}
              {100 - tier.refundPercent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "PENDING" | "APPROVED" | "REJECTED";
}) {
  return (
    <Badge variant={status === "REJECTED" ? "destructive" : "secondary"}>
      {statusLabel(status)}
    </Badge>
  );
}

function statusLabel(status: Filter) {
  return {
    PENDING: "심사 대기",
    APPROVED: "승인",
    REJECTED: "거절",
    ALL: "전체",
  }[status];
}
