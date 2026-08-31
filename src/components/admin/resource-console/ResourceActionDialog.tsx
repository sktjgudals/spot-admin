import { AlertTriangle } from "lucide-react";
import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { Action, ResourceConfig } from "@/components/admin/resource-configs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { summarizeResourceRow } from "./formatters";

export type PendingResourceAction = {
  action: Action;
  row: AdminResource;
  reason: string;
  amount: string;
};

type ResourceActionDialogProps = {
  config: ResourceConfig;
  pending: PendingResourceAction | null;
  isPending: boolean;
  confirmDisabled: boolean;
  error: Error | null;
  onReasonChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function ResourceActionDialog({
  config,
  pending,
  isPending,
  confirmDisabled,
  error,
  onReasonChange,
  onAmountChange,
  onSubmit,
  onClose,
}: ResourceActionDialogProps) {
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.action.label}</DialogTitle>
          <DialogDescription>
            {pending ? summarizeResourceRow(config, pending.row) : "이 작업을 진행할까요?"}
          </DialogDescription>
        </DialogHeader>
        {pending?.action.destructive ? (
          <div className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>이 작업은 운영 데이터에 즉시 반영됩니다. 대상과 입력값을 다시 확인해 주세요.</p>
          </div>
        ) : null}
        {pending?.action.confirm?.amount ? (
          <div className="grid gap-1.5">
            <Label htmlFor="action-amount">{pending.action.confirm.amount.label}</Label>
            <Input
              id="action-amount"
              type="number"
              min={1}
              step={1}
              value={pending.amount}
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </div>
        ) : null}
        {pending?.action.confirm?.reason ? (
          <div className="grid gap-1.5">
            <Label htmlFor="action-reason">
              {pending.action.confirm.reason.label}
              {pending.action.confirm.reason.required ? <span aria-hidden="true"> *</span> : null}
            </Label>
            <Textarea
              id="action-reason"
              aria-label={pending.action.confirm.reason.label}
              required={pending.action.confirm.reason.required}
              value={pending.reason}
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </div>
        ) : pending?.action.destructive ? null : (
          <p className="text-sm text-muted-foreground">확인 후 실행하면 운영 데이터에 즉시 반영됩니다.</p>
        )}
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            variant={pending?.action.destructive ? "destructive" : "default"}
            disabled={confirmDisabled}
            onClick={onSubmit}
          >
            {isPending ? "처리 중…" : pending?.action.confirm?.amount ? "환불 실행" : pending?.action.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
