import type { AdminResource } from "@/auth/api/admin-resources.api";

export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "boolean" | "datetime";
  required?: boolean;
  options?: readonly string[];
  defaultValue?: string | number | boolean;
};

export type ActionFields = {
  reason?: string;
  amount?: number;
};

export type Action = {
  label: string;
  path: (row: AdminResource) => string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  destructive?: boolean;
  hidden?: (row: AdminResource) => boolean;
  confirm?: {
    reason?: { label: string; required?: boolean; defaultValue?: string };
    amount?: { label: string; defaultValue: (row: AdminResource) => number };
  };
  body?: (
    row: AdminResource,
    fields: ActionFields,
  ) => Record<string, unknown> | null | undefined;
};

export type ResourceConfig = {
  key: string;
  title: string;
  description: string;
  resource: string;
  columns: readonly { key: string; label: string }[];
  create?: {
    label: string;
    path: string | ((values: Record<string, unknown>) => string);
    fields: readonly Field[];
  };
  edit?: { path: (row: AdminResource) => string; fields: readonly Field[] };
  actions?: readonly Action[];
};
