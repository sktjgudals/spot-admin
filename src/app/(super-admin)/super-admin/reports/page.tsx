"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  BellRing,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  REASON_LABELS,
  RESOLUTION_LABELS,
  TARGET_KIND_LABELS,
  getAdminReport,
  listAdminReports,
  resolveAdminReport,
  testModerationAlert,
  type AdminReport,
  type ReportResolution,
  type ReportStatus,
} from "@/auth/api/admin-reports.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

/**
 * 신고 처리 큐.
 *
 * App Store 가이드라인 1.2와 개정 약관이 "신고 접수 후 24시간 이내 조치"를
 * 약속한다. 이 화면은 그 약속을 지킬 수 있게 만드는 도구다 — 마감이 가까운
 * 순으로 정렬하고, 늦은 건을 눈에 띄게 표시하고, 조치를 한 번에 끝낸다.
 */

const TABS: { value: ReportStatus; label: string }[] = [
  { value: "PENDING", label: "처리 대기" },
  { value: "ACTIONED", label: "조치 완료" },
  { value: "DISMISSED", label: "기각" },
];

function remainingLabel(report: AdminReport): string {
  const due = new Date(report.dueAt).getTime();
  const diffMs = due - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 3_600_000);
  if (diffMs < 0) return `${hours}시간 초과`;
  return `${hours}시간 남음`;
}

export default function SuperAdminReportsPage() {
  const [status, setStatus] = useState<ReportStatus>("PENDING");
  const [openId, setOpenId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: adminQueryKeys.reports.list(status),
    queryFn: () => listAdminReports({ status }),
    // 처리 대기 목록은 오래 두면 남이 이미 처리한 건을 보게 된다.
    staleTime: 15_000,
    refetchInterval: status === "PENDING" ? 60_000 : false,
  });

  const items = reports.data?.items ?? [];

  const alertTest = useMutation({
    mutationFn: testModerationAlert,
    onSuccess: (result) => {
      if (result.delivered) {
        toast.success("Slack에 테스트 알림을 보냈습니다. 채널을 확인하세요.");
      } else {
        toast.error(result.hint ?? "Slack이 알림을 받지 못했습니다.");
      }
    },
    onError: () => toast.error("알림 테스트에 실패했습니다."),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">신고 처리</h1>
          <p className="text-sm text-muted-foreground">
            접수된 신고는 {reports.data?.slaHours ?? 24}시간 이내에 검토하고
            조치해야 합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => alertTest.mutate()}
            disabled={alertTest.isPending}
            title="Slack 알림 연결을 확인합니다"
          >
            <BellRing className="mr-2 h-4 w-4" />
            알림 테스트
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reports.refetch()}
            disabled={reports.isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${reports.isFetching ? "animate-spin" : ""}`}
            />
            새로고침
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              처리 대기
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {reports.data?.openCount ?? "—"}
          </CardContent>
        </Card>
        <Card
          className={
            (reports.data?.overdueCount ?? 0) > 0 ? "border-destructive" : ""
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {(reports.data?.overdueCount ?? 0) > 0 ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : null}
              24시간 초과
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-bold ${
              (reports.data?.overdueCount ?? 0) > 0 ? "text-destructive" : ""
            }`}
          >
            {reports.data?.overdueCount ?? "—"}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            size="sm"
            variant={status === tab.value ? "default" : "outline"}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {reports.isError ? (
            <p className="p-8 text-sm text-destructive">
              신고 목록을 불러오지 못했습니다.
            </p>
          ) : items.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">
              {reports.isLoading ? "불러오는 중…" : "표시할 신고가 없습니다."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>대상</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>신고자</TableHead>
                  <TableHead>접수</TableHead>
                  <TableHead>마감</TableHead>
                  <TableHead className="text-right">조치</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((report) => (
                  <TableRow
                    key={report.reportId}
                    className={report.overdue ? "bg-destructive/5" : ""}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {report.targetNickname ?? report.targetId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {TARGET_KIND_LABELS[report.targetKind] ??
                            report.targetKind}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {REASON_LABELS[report.reasonCode] ?? report.reasonCode}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {report.reporterNickname ?? report.reporterUserId}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(report.createdAt)}
                    </TableCell>
                    <TableCell>
                      {report.status === "PENDING" ? (
                        <Badge
                          variant={report.overdue ? "destructive" : "secondary"}
                        >
                          {remainingLabel(report)}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {report.resolution
                            ? RESOLUTION_LABELS[report.resolution]
                            : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenId(report.reportId)}
                      >
                        {report.status === "PENDING" ? "검토" : "보기"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openId ? (
        <ReportDialog
          reportId={openId}
          onClose={() => setOpenId(null)}
          onResolved={() => {
            setOpenId(null);
            void queryClient.invalidateQueries({
              queryKey: adminQueryKeys.reports.all,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function ReportDialog({
  reportId,
  onClose,
  onResolved,
}: {
  reportId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const detail = useQuery({
    queryKey: adminQueryKeys.reports.detail(reportId),
    queryFn: () => getAdminReport(reportId),
  });

  const resolve = useMutation({
    mutationFn: (resolution: ReportResolution) =>
      resolveAdminReport(reportId, {
        resolution,
        ...(note.trim() === "" ? {} : { note: note.trim() }),
      }),
    onSuccess: (_data, resolution) => {
      toast.success(`${RESOLUTION_LABELS[resolution]} 처리했습니다.`);
      onResolved();
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "조치에 실패했습니다.",
      );
    },
  });

  const report = detail.data;
  const isOpen = report?.status === "PENDING";
  const hasContent = report?.content != null;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>신고 검토</DialogTitle>
          <DialogDescription>
            {report
              ? `${TARGET_KIND_LABELS[report.targetKind] ?? report.targetKind} · ${
                  REASON_LABELS[report.reasonCode] ?? report.reasonCode
                }`
              : "불러오는 중…"}
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
              <dt className="text-muted-foreground">대상</dt>
              <dd className="font-medium">
                {report.targetNickname ?? report.targetId}
              </dd>
              <dt className="text-muted-foreground">신고자</dt>
              <dd>{report.reporterNickname ?? report.reporterUserId}</dd>
              <dt className="text-muted-foreground">접수</dt>
              <dd>{formatDateTime(report.createdAt)}</dd>
              <dt className="text-muted-foreground">처리 마감</dt>
              <dd className={report.overdue ? "text-destructive" : ""}>
                {formatDateTime(report.dueAt)}
                {report.status === "PENDING"
                  ? ` (${remainingLabel(report)})`
                  : ""}
              </dd>
              {report.status !== "PENDING" ? (
                <>
                  <dt className="text-muted-foreground">조치</dt>
                  <dd>
                    {report.resolution
                      ? RESOLUTION_LABELS[report.resolution]
                      : "—"}
                    {report.resolvedAt
                      ? ` · ${formatDateTime(report.resolvedAt)}`
                      : ""}
                  </dd>
                </>
              ) : null}
            </dl>

            {report.note ? (
              <div>
                <Label className="text-muted-foreground">신고 내용</Label>
                <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3">
                  {report.note}
                </p>
              </div>
            ) : null}

            {report.content ? (
              <div>
                <Label className="text-muted-foreground">신고된 게시글</Label>
                <p className="mt-1 whitespace-pre-wrap rounded-md border p-3">
                  {report.content.body}
                </p>
              </div>
            ) : null}

            {report.targetHistory.length > 1 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                이 대상에 대한 신고가 {report.targetHistory.length}건 있습니다.
              </p>
            ) : null}

            {isOpen ? (
              <div>
                <Label htmlFor="report-note">처리 메모 (선택)</Label>
                <Textarea
                  id="report-note"
                  className="mt-1"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="판단 근거를 남기면 다음 사람이 같은 고민을 반복하지 않습니다."
                />
              </div>
            ) : null}
          </div>
        ) : detail.isError ? (
          <p className="text-sm text-destructive">
            신고를 불러오지 못했습니다.
          </p>
        ) : null}

        {isOpen ? (
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate("DISMISSED")}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              기각
            </Button>
            <Button
              variant="outline"
              disabled={resolve.isPending || !hasContent}
              // 삭제할 콘텐츠가 없는 신고(사용자·메시지)에서는 비활성화한다.
              // 서버도 같은 이유로 거절하므로, 눌리지 않게 하는 편이 정직하다.
              title={hasContent ? undefined : "이 신고에는 삭제할 콘텐츠가 없습니다"}
              onClick={() => resolve.mutate("CONTENT_REMOVED")}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              콘텐츠 삭제
            </Button>
            <Button
              variant="destructive"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate("USER_SUSPENDED")}
            >
              <Ban className="mr-2 h-4 w-4" />
              계정 정지
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
