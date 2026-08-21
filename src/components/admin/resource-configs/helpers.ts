import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { Action, Field } from "./types";

export const text = (key: string, label: string, required = false): Field => ({
  key,
  label,
  required,
});

export const number = (key: string, label: string, defaultValue = 0): Field => ({
  key,
  label,
  type: "number",
  defaultValue,
});

export function remainingRefundable(row: AdminResource): number {
  const amount = Number(row.amount ?? 0);
  const refunded = Number(row.refundedAmount ?? 0);
  if (!Number.isFinite(amount) || !Number.isFinite(refunded)) return 0;
  return Math.max(0, Math.trunc(amount) - Math.trunc(refunded));
}

export const statusAction = (
  label: string,
  suffix: string,
  hidden: (row: AdminResource) => boolean,
): Action => ({
  label,
  path: (row) => `/admin/v2/users/${encodeURIComponent(String(row.id))}/${suffix}`,
  hidden,
  destructive: suffix === "ban",
});
