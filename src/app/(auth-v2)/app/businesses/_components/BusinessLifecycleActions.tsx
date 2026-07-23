"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  businessQueryKeys,
  disableBusiness,
  enableBusiness,
  restoreBusiness,
  softDeleteBusiness,
  type AdminBusiness,
} from "@/auth/api/admin-business.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

/**
 * SUPER_ADMIN lifecycle:
 * - disable / enable (operational)
 * - soft-delete / restore (tombstone)
 */
export function BusinessLifecycleActions({
  business,
}: {
  business: AdminBusiness;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: businessQueryKeys.all });
  };

  const run = async (
    key: string,
    fn: () => Promise<AdminBusiness>,
    okMsg: string,
  ) => {
    if (
      !window.confirm(
        key === "softDelete"
          ? "Soft-delete 할까요? (파티/결제 보존, 관리자 세션 폐기)"
          : key === "disable"
            ? "업체를 비활성화할까요? (관리자 세션 폐기)"
            : "계속할까요?",
      )
    ) {
      return;
    }
    setPending(key);
    try {
      await fn();
      toast.success(okMsg);
      await invalidate();
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "요청에 실패했습니다",
      );
    } finally {
      setPending(null);
    }
  };

  const isDeleted = !!business.deletedAt;
  const isDisabled = business.status === "DISABLED" && !isDeleted;

  return (
    <div className="flex flex-wrap gap-2">
      {!isDeleted && !isDisabled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending != null}
          onClick={() =>
            void run("disable", () => disableBusiness(business.id), "비활성화됨")
          }
        >
          {pending === "disable" ? "…" : "Disable"}
        </Button>
      )}
      {isDisabled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending != null}
          onClick={() =>
            void run("enable", () => enableBusiness(business.id), "활성화됨")
          }
        >
          {pending === "enable" ? "…" : "Enable"}
        </Button>
      )}
      {!isDeleted && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending != null}
          onClick={() =>
            void run(
              "softDelete",
              () => softDeleteBusiness(business.id),
              "Soft-delete 완료",
            )
          }
        >
          {pending === "softDelete" ? "…" : "Soft-delete"}
        </Button>
      )}
      {isDeleted && (
        <Button
          type="button"
          size="sm"
          disabled={pending != null}
          onClick={() =>
            void run("restore", () => restoreBusiness(business.id), "복구됨")
          }
        >
          {pending === "restore" ? "…" : "Restore"}
        </Button>
      )}
    </div>
  );
}
