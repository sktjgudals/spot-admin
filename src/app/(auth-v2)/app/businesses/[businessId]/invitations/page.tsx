"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import {
  cancelInvitation,
  createInvitation,
  inviteQueryKeys,
  listInvitations,
  resendInvitation,
  type AdminInvitation,
  type InvitationStatus,
} from "@/auth/api/admin-invite.api";
import {
  latestInviteDeliveryByInvitationId,
  listMailOutbox,
  mailOutboxQueryKeys,
  reprocessMailOutbox,
  type AuthMailOutboxRow,
  type AuthMailOutboxStatus,
} from "@/auth/api/admin-mail-outbox.api";
import { businessDetailPath } from "@/auth/model/admin-routes";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { getBusiness, businessQueryKeys } from "@/auth/api/admin-business.api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * PR 2B — SUPER_ADMIN invitations for one business.
 */
export default function BusinessInvitationsPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <InvitationsPage />
    </RoleGuard>
  );
}

function InvitationsPage() {
  const params = useParams();
  const businessId = String(params.businessId ?? "");
  const qc = useQueryClient();

  const bizQuery = useQuery({
    queryKey: businessQueryKeys.detail(businessId),
    queryFn: () => getBusiness(businessId, { includeDeleted: true }),
    enabled: !!businessId,
  });

  const invQuery = useQuery({
    queryKey: inviteQueryKeys.list(businessId),
    queryFn: () => listInvitations(businessId),
    enabled: !!businessId,
  });

  const outboxQuery = useQuery({
    queryKey: mailOutboxQueryKeys.list({ type: "INVITATION" }),
    queryFn: () => listMailOutbox({ type: "INVITATION" }),
    enabled: !!businessId,
  });

  const invitations = invQuery.data ?? [];
  const deliveryMap = useMemo(
    () =>
      latestInviteDeliveryByInvitationId(
        outboxQuery.data ?? [],
        invitations.map((i) => i.id),
      ),
    [outboxQuery.data, invitations],
  );

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: inviteQueryKeys.list(businessId) }),
      qc.invalidateQueries({
        queryKey: mailOutboxQueryKeys.list({ type: "INVITATION" }),
      }),
    ]);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">초대 관리</h1>
          <p className="text-sm text-muted-foreground">
            {bizQuery.data?.name ?? businessId}
          </p>
        </div>
        <Button
          nativeButton={false}
          size="sm"
          variant="ghost"
          render={<Link href={businessDetailPath(businessId)} />}
        >
          ← 업체 상세
        </Button>
      </div>

      <CreateInviteCard businessId={businessId} onCreated={invalidate} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">초대 목록</CardTitle>
            <CardDescription>
              resend = 동일 row · tokenVersion++ · 이전 outbox CANCELLED
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={invQuery.isFetching}
            onClick={() => void invalidate()}
          >
            새로고침
          </Button>
        </CardHeader>
        <CardContent>
          {invQuery.isLoading && (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          )}
          {invQuery.isError && (
            <p className="text-sm text-destructive">
              {(invQuery.error as Error)?.message ?? "목록 실패"}
            </p>
          )}
          {!invQuery.isLoading && !invQuery.isError && (
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>이메일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>메일</TableHead>
                    <TableHead>만료</TableHead>
                    <TableHead>재발송</TableHead>
                    <TableHead className="w-40">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        초대가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                  {invitations.map((inv) => (
                    <InviteRow
                      key={inv.id}
                      businessId={businessId}
                      invitation={inv}
                      delivery={deliveryMap.get(inv.id) ?? null}
                      onChanged={invalidate}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateInviteCard({
  businessId,
  onCreated,
}: {
  businessId: string;
  onCreated: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastDevToken, setLastDevToken] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setLastDevToken(null);
    try {
      const res = await createInvitation(businessId, email.trim());
      toast.success(`초대 생성: ${res.invitation.email}`);
      if (res.inviteToken) {
        setLastDevToken(res.inviteToken);
        toast.message("dev inviteToken 응답 (운영에서는 비활성)");
      }
      setEmail("");
      await onCreated();
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "초대 생성 실패",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">BUSINESS_ADMIN 초대</CardTitle>
        <CardDescription>
          이메일로 초대 메일(outbox)이 적재됩니다. 가입은 accept 링크로 완료.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="flex flex-col sm:flex-row gap-2 sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email">이메일</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="owner@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "생성 중…" : "초대 생성"}
          </Button>
        </form>
        {lastDevToken && (
          <p className="mt-3 text-xs break-all text-muted-foreground font-mono bg-muted p-2 rounded">
            inviteToken (dev): {lastDevToken}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function InviteRow({
  businessId,
  invitation,
  delivery,
  onChanged,
}: {
  businessId: string;
  invitation: AdminInvitation;
  delivery: AuthMailOutboxRow | null;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"cancel" | "resend" | "reprocess" | null>(
    null,
  );
  const canAct =
    invitation.status === "PENDING" ||
    invitation.status === "EXPIRED" ||
    invitation.status === "REVOKED";
  const canCancel = invitation.status === "PENDING";

  const run = async (
    key: "cancel" | "resend" | "reprocess",
    fn: () => Promise<unknown>,
    ok: string,
  ) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await onChanged();
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "요청 실패",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{invitation.email}</div>
        <div className="text-xs text-muted-foreground font-mono">
          v{invitation.tokenVersion} · {invitation.role}
        </div>
      </TableCell>
      <TableCell>
        <InviteStatusBadge status={invitation.status} />
      </TableCell>
      <TableCell>
        <DeliveryCell
          delivery={delivery}
          busy={busy === "reprocess"}
          onReprocess={
            delivery?.status === "DEAD"
              ? () =>
                  void run(
                    "reprocess",
                    () => reprocessMailOutbox(delivery.id),
                    "재처리 큐에 넣었습니다",
                  )
              : undefined
          }
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(invitation.expiresAt).toLocaleString()}
      </TableCell>
      <TableCell className="text-sm text-center">
        {invitation.resendCount}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {canCancel && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy != null}
              onClick={() =>
                void run(
                  "cancel",
                  () => cancelInvitation(businessId, invitation.id),
                  "초대 취소됨",
                )
              }
            >
              {busy === "cancel" ? "…" : "Cancel"}
            </Button>
          )}
          {canAct && invitation.status !== "ACCEPTED" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy != null}
              onClick={() =>
                void run(
                  "resend",
                  () => resendInvitation(businessId, invitation.id),
                  "재발송 요청됨",
                )
              }
            >
              {busy === "resend" ? "…" : "Resend"}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function InviteStatusBadge({ status }: { status: InvitationStatus }) {
  const variant =
    status === "PENDING"
      ? "default"
      : status === "ACCEPTED"
        ? "secondary"
        : status === "REVOKED"
          ? "outline"
          : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

function DeliveryCell({
  delivery,
  busy,
  onReprocess,
}: {
  delivery: AuthMailOutboxRow | null;
  busy?: boolean;
  onReprocess?: () => void;
}) {
  if (!delivery) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-1">
      <MailStatusBadge status={delivery.status} />
      {delivery.lastError && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 max-w-[140px]">
          {delivery.lastError}
        </p>
      )}
      {onReprocess && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1 text-xs"
          disabled={busy}
          onClick={onReprocess}
        >
          {busy ? "…" : "재처리"}
        </Button>
      )}
    </div>
  );
}

function MailStatusBadge({ status }: { status: AuthMailOutboxStatus }) {
  const variant =
    status === "SENT"
      ? "default"
      : status === "PENDING" || status === "PROCESSING"
        ? "secondary"
        : status === "DEAD"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
