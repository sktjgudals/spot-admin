"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminResources,
  mutateAdminResource,
  type AdminResource,
} from "@/auth/api/admin-resources.api";
import {
  getResourceConfig,
  resourceConfigs,
  type Action,
  type ActionFields,
  type Field,
  type ResourceConfig,
} from "@/components/admin/resource-configs";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format-date";

const PAGE_SIZE = 50;

export type { ResourceConfig };
export { getResourceConfig, resourceConfigs };

type PendingAction = {
  action: Action;
  row: AdminResource;
  reason: string;
  amount: string;
};

function display(value: unknown, key: string): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") {
    if (/At$/.test(key) && value > 1_000_000_000_000) return formatDateTime(value);
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string" && (/At$/.test(key) || key === "date")) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return formatDateTime(parsed);
  }
  if (typeof value === "object") return JSON.stringify(value);
  if (/status|role|kind|audience|actionType/i.test(key)) {
    return <Badge variant="outline">{String(value)}</Badge>;
  }
  return String(value);
}

function displayText(value: unknown, key: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") {
    if (/At$/.test(key) && value > 1_000_000_000_000) return formatDateTime(value);
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string" && (/At$/.test(key) || key === "date")) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return formatDateTime(parsed);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rowSummary(config: ResourceConfig, row: AdminResource): string {
  return config.columns
    .slice(0, 4)
    .map((column) => `${column.label} ${displayText(row[column.key], column.key)}`)
    .join(" · ");
}

function initialValues(fields: readonly Field[], row?: AdminResource): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [field.key, row?.[field.key] ?? field.defaultValue ?? (field.type === "boolean" ? false : "")]),
  );
}

function normalizeValues(fields: readonly Field[], values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === "" && !field.required) continue;
    if (field.type === "number") result[field.key] = Number(raw);
    else if (field.type === "boolean") result[field.key] = Boolean(raw);
    else if (field.type === "datetime" && typeof raw === "string") result[field.key] = new Date(raw).toISOString();
    else result[field.key] = raw;
  }
  return result;
}

export function AdminResourceConsole({ config }: { config: ResourceConfig }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; row?: AdminResource } | null>(null);
  const fields = editor?.mode === "create" ? config.create?.fields : config.edit?.fields;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const queryKey = useMemo(() => ["admin-v2", config.resource, query], [config.resource, query]);
  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listAdminResources(config.resource, {
        q: query,
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const asOf = list.data?.pages.at(-1)?.asOf;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-v2", config.resource] });
  };
  const mutation = useMutation({
    mutationFn: (input: { path: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: Record<string, unknown> }) =>
      mutateAdminResource(input.path, input.method, input.body),
    onSuccess: () => {
      toast.success("처리되었습니다.");
      setEditor(null);
      setPending(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "처리하지 못했습니다."),
  });

  const openEditor = (mode: "create" | "edit", row?: AdminResource) => {
    const nextFields = mode === "create" ? config.create?.fields : config.edit?.fields;
    if (!nextFields) return;
    setValues(initialValues(nextFields, row));
    setEditor({ mode, row });
  };

  const submitEditor = () => {
    if (!editor || !fields) return;
    const body = normalizeValues(fields, values);
    const path = editor.mode === "create"
      ? typeof config.create?.path === "function" ? config.create.path(body) : config.create?.path
      : editor.row && config.edit?.path(editor.row);
    if (!path) return;
    mutation.mutate({ path, method: editor.mode === "create" ? (config.resource === "config" ? "PUT" : "POST") : (config.resource === "config" ? "PUT" : "PATCH"), body });
  };

  const openAction = (action: Action, row: AdminResource) => {
    setPending({
      action,
      row,
      reason: action.confirm?.reason?.defaultValue ?? "",
      amount: action.confirm?.amount ? String(action.confirm.amount.defaultValue(row)) : "",
    });
  };

  const submitAction = () => {
    if (!pending) return;
    const fieldsForBody: ActionFields = {};
    if (pending.action.confirm?.reason) {
      const reason = pending.reason.trim();
      if (pending.action.confirm.reason.required && !reason) {
        toast.error(`${pending.action.confirm.reason.label}을 입력해 주세요.`);
        return;
      }
      fieldsForBody.reason = reason;
    }
    if (pending.action.confirm?.amount) {
      const amount = Number(pending.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        toast.error("환불 금액은 1원 이상 정수여야 합니다.");
        return;
      }
      fieldsForBody.amount = amount;
    }
    const body = pending.action.body?.(pending.row, fieldsForBody);
    if (body === null) return;
    mutation.mutate({
      path: pending.action.path(pending.row),
      method: pending.action.method ?? "POST",
      ...(body === undefined ? {} : { body }),
    });
  };

  const confirmDisabled = Boolean(
    mutation.isPending ||
      (pending?.action.confirm?.reason?.required && pending.reason.trim().length === 0) ||
      (pending?.action.confirm?.amount && (!Number.isInteger(Number(pending.amount)) || Number(pending.amount) <= 0)),
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
          {list.data && asOf ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {`${items.length}건${list.hasNextPage ? "+" : ""} · 기준 ${formatDateTime(asOf)}`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
            <Input aria-label="검색어" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="검색" className="w-44" />
            <Button type="submit" variant="outline" size="sm"><Search className="h-4 w-4" /> 검색</Button>
          </form>
          <Button variant="outline" size="sm" disabled={list.isFetching} onClick={() => void list.refetch()}><RefreshCw className="h-4 w-4" /> 새로고침</Button>
          {config.create ? <Button size="sm" onClick={() => openEditor("create")}><Plus className="h-4 w-4" /> {config.create.label}</Button> : null}
        </div>
      </div>

      {list.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-background p-6">
          <p className="font-medium text-destructive">데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">{list.error instanceof Error ? list.error.message : "잠시 후 다시 시도해 주세요."}</p>
          <Button className="mt-3" variant="outline" onClick={() => void list.refetch()}>다시 시도</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border bg-background">
            <Table className="min-w-[800px]">
              <TableHeader><TableRow>{config.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}{config.edit || config.actions ? <TableHead className="text-right">작업</TableHead> : null}</TableRow></TableHeader>
              <TableBody>
                {list.isPending ? Array.from({ length: 5 }, (_, index) => <TableRow key={index}><TableCell colSpan={config.columns.length + 1}><div className="h-6 animate-pulse rounded bg-muted" /></TableCell></TableRow>) : null}
                {!list.isPending && items.length === 0 ? <TableRow><TableCell colSpan={config.columns.length + 1} className="py-12 text-center text-muted-foreground">결과가 없습니다.</TableCell></TableRow> : null}
                {items.map((row) => (
                  <TableRow key={row.id}>
                    {config.columns.map((column) => <TableCell key={column.key} className="max-w-72 truncate">{display(row[column.key], column.key)}</TableCell>)}
                    {config.edit || config.actions ? <TableCell><div className="flex justify-end gap-1">
                      {config.edit ? <Button size="sm" variant="ghost" onClick={() => openEditor("edit", row)}><Pencil className="h-4 w-4" /> 수정</Button> : null}
                      {config.actions?.filter((action) => !action.hidden?.(row)).map((action) => <Button key={action.label} size="sm" variant={action.destructive ? "destructive" : "outline"} disabled={mutation.isPending} onClick={() => openAction(action, row)}>{action.destructive ? <Trash2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}{action.label}</Button>)}
                    </div></TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {list.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editor?.mode === "create" ? config.create?.label : `${config.title} 수정`}</DialogTitle><DialogDescription>저장하면 운영 원본 데이터와 감사 로그에 반영됩니다.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            {fields?.map((field) => <div key={field.key} className="grid gap-1.5"><Label htmlFor={`${config.key}-${field.key}`}>{field.label}{field.required ? " *" : ""}</Label>{field.type === "textarea" ? <Textarea id={`${config.key}-${field.key}`} value={String(values[field.key] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} /> : field.options ? <select id={`${config.key}-${field.key}`} className="h-9 rounded-md border bg-background px-3 text-sm" value={String(values[field.key] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === "boolean" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))} /> 활성화</label> : <Input id={`${config.key}-${field.key}`} type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"} required={field.required} value={String(values[field.key] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />}</div>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditor(null)}>취소</Button><Button disabled={mutation.isPending} onClick={submitEditor}>{mutation.isPending ? "저장 중…" : "저장"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.action.label}</DialogTitle>
            <DialogDescription>
              {pending ? rowSummary(config, pending.row) : "이 작업을 진행할까요?"}
            </DialogDescription>
          </DialogHeader>
          {pending?.action.confirm?.amount ? (
            <div className="grid gap-1.5">
              <Label htmlFor="action-amount">{pending.action.confirm.amount.label}</Label>
              <Input
                id="action-amount"
                type="number"
                min={1}
                step={1}
                value={pending.amount}
                onChange={(event) => setPending((current) => current ? { ...current, amount: event.target.value } : current)}
              />
            </div>
          ) : null}
          {pending?.action.confirm?.reason ? (
            <div className="grid gap-1.5">
              <Label htmlFor="action-reason">{pending.action.confirm.reason.label}</Label>
              <Textarea
                id="action-reason"
                value={pending.reason}
                onChange={(event) => setPending((current) => current ? { ...current, reason: event.target.value } : current)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">이 작업은 즉시 운영 데이터에 반영됩니다.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>취소</Button>
            <Button
              variant={pending?.action.destructive ? "destructive" : "default"}
              disabled={confirmDisabled}
              onClick={submitAction}
            >
              {mutation.isPending ? "처리 중…" : pending?.action.confirm?.amount ? "환불 실행" : pending?.action.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
