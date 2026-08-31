"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  ResourceActionDialog,
  type PendingResourceAction,
} from "@/components/admin/resource-console/ResourceActionDialog";
import { ResourceConsoleHeader } from "@/components/admin/resource-console/ResourceConsoleHeader";
import { ResourceDetailSheet } from "@/components/admin/resource-console/ResourceDetailSheet";
import {
  ResourceEditorDialog,
  type ResourceEditorState,
} from "@/components/admin/resource-console/ResourceEditorDialog";
import { ResourceList } from "@/components/admin/resource-console/ResourceList";
import { useCursorAppendFocus } from "@/hooks/use-cursor-append-focus";

const PAGE_SIZE = 50;

export type { ResourceConfig };
export { getResourceConfig, resourceConfigs };

function initialValues(fields: readonly Field[], row?: AdminResource): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      row?.[field.key] ?? field.defaultValue ?? (field.type === "boolean" ? false : ""),
    ]),
  );
}

function validateValues(fields: readonly Field[], values: Record<string, unknown>): string | null {
  for (const field of fields) {
    const raw = values[field.key];
    if (field.required && (raw === "" || raw === null || raw === undefined)) {
      return `${field.label}을 입력해 주세요.`;
    }
    if (field.type === "number" && raw !== "" && !Number.isFinite(Number(raw))) {
      return `${field.label}에 올바른 숫자를 입력해 주세요.`;
    }
    if (field.type === "datetime" && typeof raw === "string" && raw && Number.isNaN(Date.parse(raw))) {
      return `${field.label}에 올바른 날짜와 시각을 입력해 주세요.`;
    }
  }
  return null;
}

function normalizeValues(fields: readonly Field[], values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === "" && !field.required) continue;
    if (field.type === "number") result[field.key] = Number(raw);
    else if (field.type === "boolean") result[field.key] = Boolean(raw);
    else if (field.type === "datetime" && typeof raw === "string") {
      result[field.key] = new Date(raw).toISOString();
    } else result[field.key] = raw;
  }
  return result;
}

export function AdminResourceConsole({
  config,
  queryParamNamespace,
}: {
  config: ResourceConfig;
  queryParamNamespace?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryParam = queryParamNamespace ? `${queryParamNamespace}_q` : "q";
  const statusParam = queryParamNamespace
    ? `${queryParamNamespace}_status`
    : "status";
  const urlQuery = searchParams.get(queryParam)?.trim() ?? "";
  const urlStatus = searchParams.get(statusParam)?.trim() ?? "";
  const urlStateKey = `${config.key}\u0000${queryParam}\u0000${urlQuery}\u0000${statusParam}\u0000${urlStatus}`;
  const [filters, setFilters] = useState(() => ({
    urlStateKey,
    search: urlQuery,
    query: urlQuery,
    status: urlStatus,
  }));
  if (filters.urlStateKey !== urlStateKey) {
    setFilters({
      urlStateKey,
      search: urlQuery,
      query: urlQuery,
      status: urlStatus,
    });
  }
  const { search, query, status } = filters;

  const [editor, setEditor] = useState<ResourceEditorState | null>(null);
  const fields = editor?.mode === "create" ? config.create?.fields : config.edit?.fields;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [pending, setPending] = useState<PendingResourceAction | null>(null);
  const [detail, setDetail] = useState<AdminResource | null>(null);
  const pageStateKey = `${config.resource}\u0000${query}\u0000${status}`;
  const [pageState, setPageState] = useState({ key: pageStateKey, index: 0 });
  const queryKey = useMemo(
    () => ["admin-v2", config.resource, { q: query, status }],
    [config.resource, query, status],
  );

  const replaceFilters = useCallback(
    (nextQuery: string, nextStatus: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQuery) params.set(queryParam, nextQuery);
      else params.delete(queryParam);
      if (nextStatus) params.set(statusParam, nextStatus);
      else params.delete(statusParam);
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, queryParam, router, searchParams, statusParam],
  );

  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listAdminResources(config.resource, {
        q: query,
        ...(status ? { status } : {}),
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const requestedPageIndex = pageState.key === pageStateKey ? pageState.index : 0;
  const currentPageIndex = Math.min(requestedPageIndex, Math.max(0, pages.length - 1));
  const visibleItems = pages[currentPageIndex]?.items ?? [];
  const asOf = list.data?.pages.at(-1)?.asOf;
  const hasFilters = Boolean(query || status);
  const hasPreviousPage = currentPageIndex > 0;
  const hasLoadedNextPage = currentPageIndex < pages.length - 1;
  const hasNextPage = hasLoadedNextPage || Boolean(list.hasNextPage);
  const {
    beginAppend: beginPageFocusHandoff,
    setFallbackRef,
    setItemRef,
    setRetryButtonRef,
  } = useCursorAppendFocus<HTMLElement>({
    scopeKey: pageStateKey,
    viewKey: String(currentPageIndex),
    itemKeys: visibleItems.map((item) => item.id),
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    hasNextPage,
    focusMode: "page",
  });

  const showNextPage = async () => {
    beginPageFocusHandoff();
    if (hasLoadedNextPage) {
      setPageState({ key: pageStateKey, index: currentPageIndex + 1 });
      return;
    }
    const previousPageCount = pages.length;
    const result = await list.fetchNextPage();
    if (result.data && result.data.pages.length > previousPageCount) {
      setPageState({ key: pageStateKey, index: previousPageCount });
    }
  };
  const showPreviousPage = () => {
    beginPageFocusHandoff();
    setPageState({
      key: pageStateKey,
      index: Math.max(0, currentPageIndex - 1),
    });
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-v2", config.resource] });
  };
  const mutation = useMutation({
    mutationFn: (input: {
      path: string;
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: Record<string, unknown>;
    }) => mutateAdminResource(input.path, input.method, input.body),
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
    mutation.reset();
    setValues(initialValues(nextFields, row));
    setEditor({ mode, row });
  };

  const submitEditor = () => {
    if (!editor || !fields) return;
    const validationError = validateValues(fields, values);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const body = normalizeValues(fields, values);
    const path = editor.mode === "create"
      ? typeof config.create?.path === "function"
        ? config.create.path(body)
        : config.create?.path
      : editor.row && config.edit?.path(editor.row);
    if (!path) return;
    mutation.mutate({
      path,
      method: editor.mode === "create"
        ? config.resource === "config" ? "PUT" : "POST"
        : config.resource === "config" ? "PUT" : "PATCH",
      body,
    });
  };

  const openAction = (action: Action, row: AdminResource) => {
    mutation.reset();
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

  const applySearch = () => {
    const nextQuery = search.trim();
    setFilters((current) => ({ ...current, search: nextQuery, query: nextQuery }));
    replaceFilters(nextQuery, status);
  };

  const applyStatus = (nextStatus: string) => {
    setFilters((current) => ({ ...current, status: nextStatus }));
    replaceFilters(query, nextStatus);
  };

  const clearFilters = () => {
    setFilters((current) => ({ ...current, search: "", query: "", status: "" }));
    replaceFilters("", "");
  };

  const confirmDisabled = Boolean(
    mutation.isPending
      || (pending?.action.confirm?.reason?.required && pending.reason.trim().length === 0)
      || (pending?.action.confirm?.amount
        && (!Number.isInteger(Number(pending.amount)) || Number(pending.amount) <= 0)),
  );
  const mutationError = mutation.error instanceof Error ? mutation.error : null;

  return (
    <section className="space-y-4" aria-labelledby={`${config.key}-title`}>
      <ResourceConsoleHeader
        config={config}
        count={items.length}
        hasNextPage={Boolean(list.hasNextPage)}
        asOf={asOf}
        hasData={Boolean(list.data)}
        isFetching={list.isFetching}
        isPending={list.isPending}
        search={search}
        query={query}
        status={status}
        hasFilters={hasFilters}
        onSearchChange={(value) => setFilters((current) => ({ ...current, search: value }))}
        onSearchSubmit={applySearch}
        onStatusChange={applyStatus}
        onClearFilters={clearFilters}
        onRefresh={() => void list.refetch()}
        onCreate={() => openEditor("create")}
      />

      <ResourceList
        config={config}
        items={visibleItems}
        error={list.error instanceof Error ? list.error : null}
        isError={list.isError}
        isFetchNextPageError={list.isFetchNextPageError}
        isPending={list.isPending}
        isFetchingNextPage={list.isFetchingNextPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        hasFilters={hasFilters}
        mutationPending={mutation.isPending}
        onRetry={() => void list.refetch()}
        onClearFilters={clearFilters}
        onFetchNextPage={() => void showNextPage()}
        onPreviousPage={showPreviousPage}
        setFallbackRef={setFallbackRef}
        setItemRef={setItemRef}
        setRetryButtonRef={setRetryButtonRef}
        onDetail={setDetail}
        onEdit={(row) => openEditor("edit", row)}
        onAction={openAction}
      />

      <ResourceDetailSheet
        config={config}
        row={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
      <ResourceEditorDialog
        config={config}
        editor={editor}
        fields={fields}
        values={values}
        isPending={mutation.isPending}
        error={mutationError}
        onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        onSubmit={submitEditor}
        onClose={() => setEditor(null)}
      />
      <ResourceActionDialog
        config={config}
        pending={pending}
        isPending={mutation.isPending}
        confirmDisabled={confirmDisabled}
        error={mutationError}
        onReasonChange={(reason) => setPending((current) => current ? { ...current, reason } : current)}
        onAmountChange={(amount) => setPending((current) => current ? { ...current, amount } : current)}
        onSubmit={submitAction}
        onClose={() => setPending(null)}
      />
    </section>
  );
}
