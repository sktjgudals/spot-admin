"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminResources,
  mutateAdminResource,
  type AdminResource,
} from "@/auth/api/admin-resources.api";
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

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "boolean" | "datetime";
  required?: boolean;
  options?: readonly string[];
  defaultValue?: string | number | boolean;
};

type Action = {
  label: string;
  path: (row: AdminResource) => string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  destructive?: boolean;
  hidden?: (row: AdminResource) => boolean;
  body?: (row: AdminResource) => Record<string, unknown> | null;
};

export type ResourceConfig = {
  key: string;
  title: string;
  description: string;
  resource: string;
  columns: readonly { key: string; label: string }[];
  create?: { label: string; path: string | ((values: Record<string, unknown>) => string); fields: readonly Field[] };
  edit?: { path: (row: AdminResource) => string; fields: readonly Field[] };
  actions?: readonly Action[];
};

function display(value: unknown, key: string): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") {
    if (/At$/.test(key) && value > 1_000_000_000_000) return new Date(value).toLocaleString("ko-KR");
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string" && (/At$/.test(key) || key === "date")) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleString("ko-KR");
  }
  if (typeof value === "object") return JSON.stringify(value);
  if (/status|role|kind|audience|actionType/i.test(key)) {
    return <Badge variant="outline">{String(value)}</Badge>;
  }
  return String(value);
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
  const queryKey = useMemo(() => ["admin-v2", config.resource, query], [config.resource, query]);
  const list = useQuery({
    queryKey,
    queryFn: () => listAdminResources(config.resource, { q: query, limit: 100 }),
    retry: 2,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-v2", config.resource] });
  };
  const mutation = useMutation({
    mutationFn: (input: { path: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: Record<string, unknown> }) =>
      mutateAdminResource(input.path, input.method, input.body),
    onSuccess: () => {
      toast.success("처리되었습니다.");
      setEditor(null);
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

  const runAction = (action: Action, row: AdminResource) => {
    if (!window.confirm(`${action.label} 작업을 진행할까요?`)) return;
    const body = action.body?.(row);
    if (body === null) return;
    mutation.mutate({ path: action.path(row), method: action.method ?? "POST", ...(body === undefined ? {} : { body }) });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
          {list.data ? <p className="mt-1 text-xs text-muted-foreground">{list.data.items.length}건 · 기준 {new Date(list.data.asOf).toLocaleString("ko-KR")}</p> : null}
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
        <div className="overflow-hidden rounded-lg border bg-background">
          <Table className="min-w-[800px]">
            <TableHeader><TableRow>{config.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}{config.edit || config.actions ? <TableHead className="text-right">작업</TableHead> : null}</TableRow></TableHeader>
            <TableBody>
              {list.isPending ? Array.from({ length: 5 }, (_, index) => <TableRow key={index}><TableCell colSpan={config.columns.length + 1}><div className="h-6 animate-pulse rounded bg-muted" /></TableCell></TableRow>) : null}
              {!list.isPending && list.data?.items.length === 0 ? <TableRow><TableCell colSpan={config.columns.length + 1} className="py-12 text-center text-muted-foreground">결과가 없습니다.</TableCell></TableRow> : null}
              {list.data?.items.map((row) => (
                <TableRow key={row.id}>
                  {config.columns.map((column) => <TableCell key={column.key} className="max-w-72 truncate">{display(row[column.key], column.key)}</TableCell>)}
                  {config.edit || config.actions ? <TableCell><div className="flex justify-end gap-1">
                    {config.edit ? <Button size="sm" variant="ghost" onClick={() => openEditor("edit", row)}><Pencil className="h-4 w-4" /> 수정</Button> : null}
                    {config.actions?.filter((action) => !action.hidden?.(row)).map((action) => <Button key={action.label} size="sm" variant={action.destructive ? "destructive" : "outline"} disabled={mutation.isPending} onClick={() => runAction(action, row)}>{action.destructive ? <Trash2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}{action.label}</Button>)}
                  </div></TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
    </section>
  );
}

const text = (key: string, label: string, required = false): Field => ({ key, label, required });
const number = (key: string, label: string, defaultValue = 0): Field => ({ key, label, type: "number", defaultValue });
const statusAction = (label: string, suffix: string, hidden: (row: AdminResource) => boolean): Action => ({ label, path: (row) => `/admin/v2/users/${row.id}/${suffix}`, hidden, destructive: suffix === "ban" });

export const resourceConfigs: Record<string, ResourceConfig> = {
  users: { key: "users", title: "사용자 관리", description: "계정 역할과 이용 상태를 관리합니다.", resource: "users", columns: [{ key: "nickname", label: "이름" }, { key: "email", label: "이메일" }, { key: "role", label: "역할" }, { key: "status", label: "상태" }, { key: "createdAt", label: "가입일" }], edit: { path: (row) => `/admin/v2/users/${row.id}`, fields: [text("nickname", "이름", true), { key: "role", label: "역할", options: ["USER", "ADMIN", "SUPER_ADMIN"] }, { key: "status", label: "상태", options: ["ACTIVE", "SUSPENDED"] }] }, actions: [statusAction("정지", "ban", (row) => row.status === "SUSPENDED"), statusAction("정지 해제", "unban", (row) => row.status !== "SUSPENDED")] },
  "business-role-requests": { key: "business-role-requests", title: "업체 권한 신청", description: "업체 관리자 권한 신청을 승인하거나 거절합니다.", resource: "business-role-requests", columns: [{ key: "businessName", label: "업체" }, { key: "nickname", label: "신청자" }, { key: "email", label: "이메일" }, { key: "reason", label: "사유" }, { key: "status", label: "상태" }, { key: "createdAt", label: "신청일" }], actions: [{ label: "승인", path: (row) => `/admin/v2/business-role-requests/${row.id}/approve`, hidden: (row) => row.status !== "PENDING", body: () => ({}) }, { label: "거절", path: (row) => `/admin/v2/business-role-requests/${row.id}/reject`, hidden: (row) => row.status !== "PENDING", destructive: true, body: () => { const reason = window.prompt("거절 사유를 입력하세요."); return reason ? { reason } : null; } }] },
  "refund-policy-requests": { key: "refund-policy-requests", title: "환불 정책 변경", description: "업체의 환불 정책 변경 요청을 검토합니다.", resource: "refund-policy-change-requests", columns: [{ key: "businessName", label: "업체" }, { key: "proposedTiers", label: "정책" }, { key: "reason", label: "사유" }, { key: "status", label: "상태" }, { key: "createdAt", label: "요청일" }], actions: [{ label: "승인", path: (row) => `/admin/v2/refund-policy-change-requests/${row.id}/approve`, hidden: (row) => row.status !== "PENDING", body: () => ({}) }, { label: "거절", path: (row) => `/admin/v2/refund-policy-change-requests/${row.id}/reject`, hidden: (row) => row.status !== "PENDING", destructive: true, body: () => { const reason = window.prompt("거절 사유를 입력하세요."); return reason ? { reason } : null; } }] },
  coupons: { key: "coupons", title: "쿠폰 관리", description: "플랫폼 공통 쿠폰을 발행하고 금액을 관리합니다.", resource: "coupons", columns: [{ key: "title", label: "이름" }, { key: "campaignId", label: "캠페인" }, { key: "discountAmount", label: "할인액" }, { key: "validDays", label: "유효일" }, { key: "kind", label: "종류" }, { key: "isActive", label: "활성" }], create: { label: "쿠폰 추가", path: "/admin/v2/coupons", fields: [text("campaignId", "캠페인 ID", true), text("title", "쿠폰명", true), { key: "description", label: "설명", type: "textarea" }, number("discountAmount", "할인액"), number("minimumOrderAmount", "최소 주문액"), number("maximumDiscountAmount", "최대 할인액"), number("validDays", "유효일", 30), { key: "kind", label: "종류", options: ["CLAIMABLE", "SYSTEM"], defaultValue: "CLAIMABLE" }] }, edit: { path: (row) => `/admin/v2/coupons/${row.id}`, fields: [number("discountAmount", "할인액"), number("minimumOrderAmount", "최소 주문액"), number("maximumDiscountAmount", "최대 할인액")] }, actions: [{ label: "비활성화", path: (row) => `/admin/v2/coupons/${row.id}`, method: "DELETE", destructive: true, hidden: (row) => row.isActive === false }] },
  inquiries: { key: "inquiries", title: "문의 관리", description: "웹사이트로 접수된 문의를 확인하고 처리합니다.", resource: "inquiries", columns: [{ key: "name", label: "이름" }, { key: "contact", label: "연락처" }, { key: "message", label: "문의 내용" }, { key: "status", label: "상태" }, { key: "createdAt", label: "접수일" }], actions: [{ label: "처리 완료", path: (row) => `/admin/v2/inquiries/${row.id}/resolve`, hidden: (row) => row.status === "RESOLVED" }] },
  payments: { key: "payments", title: "결제 관리", description: "결제 내역을 조회하고 수동 환불을 처리합니다.", resource: "payments", columns: [{ key: "orderId", label: "주문번호" }, { key: "partyTitle", label: "파티" }, { key: "businessName", label: "업체" }, { key: "amount", label: "금액" }, { key: "status", label: "상태" }, { key: "createdAt", label: "결제일" }], actions: [{ label: "수동 환불", path: (row) => `/admin/v2/payments/${row.id}/manual-refund`, destructive: true, hidden: (row) => !["PAID", "APPROVED", "DONE"].includes(String(row.status)), body: (row) => { const raw = window.prompt("환불 금액", String(row.amount ?? "")); if (!raw) return null; const reason = window.prompt("환불 사유", "관리자 수동 환불"); return reason ? { amount: Number(raw), reason } : null; } }] },
  refunds: { key: "refunds", title: "환불 재처리", description: "실패하거나 추가 조치가 필요한 환불을 재시도합니다.", resource: "refunds", columns: [{ key: "orderId", label: "주문번호" }, { key: "partyTitle", label: "파티" }, { key: "amount", label: "환불액" }, { key: "status", label: "상태" }, { key: "lastErrorCode", label: "오류" }, { key: "requestedAt", label: "요청일" }], actions: [{ label: "재시도", path: (row) => `/admin/v2/refunds/${row.id}/retry`, hidden: (row) => !["FAILED", "ACTION_REQUIRED", "REQUESTED"].includes(String(row.status)), body: () => ({}) }] },
  notifications: { key: "notifications", title: "알림 캠페인", description: "전체·사용자·파티·업체 대상 알림을 예약하거나 즉시 발송합니다.", resource: "notification-campaigns", columns: [{ key: "title", label: "제목" }, { key: "audience", label: "대상" }, { key: "status", label: "상태" }, { key: "targetCount", label: "대상 수" }, { key: "deliveredCount", label: "성공" }, { key: "createdAt", label: "생성일" }], create: { label: "캠페인 만들기", path: "/admin/v2/notifications/campaigns", fields: [text("title", "제목", true), { key: "body", label: "내용", type: "textarea", required: true }, { key: "audience", label: "대상", options: ["ALL", "USER", "PARTY", "BUSINESS"], defaultValue: "ALL" }, text("audienceId", "대상 ID"), text("clickAction", "클릭 액션"), { key: "scheduledAt", label: "예약 시각", type: "datetime" }, { key: "sendNow", label: "즉시 발송", type: "boolean" }] }, actions: [{ label: "지금 발송", path: (row) => `/admin/v2/notifications/campaigns/${row.id}/send`, hidden: (row) => !["DRAFT", "QUEUED", "FAILED"].includes(String(row.status)) }, { label: "취소", path: (row) => `/admin/v2/notifications/campaigns/${row.id}/cancel`, destructive: true, hidden: (row) => !["DRAFT", "QUEUED", "FAILED"].includes(String(row.status)) }] },
  banners: { key: "banners", title: "배너 관리", description: "앱 메인 배너의 이미지, 노출 순서와 액션을 관리합니다.", resource: "banners", columns: [{ key: "title", label: "제목" }, { key: "imageUrl", label: "이미지" }, { key: "actionType", label: "액션" }, { key: "sortOrder", label: "순서" }, { key: "isActive", label: "활성" }], create: { label: "배너 추가", path: "/admin/v2/banners", fields: [text("title", "제목", true), text("imageUrl", "이미지 URL", true), { key: "actionType", label: "액션", options: ["NONE", "DEEPLINK", "WEB", "INSTAGRAM", "YOUTUBE", "PHONE", "EMAIL", "CUSTOM"], defaultValue: "NONE" }, text("actionValue", "액션 값"), text("linkUrl", "링크 URL"), number("sortOrder", "순서"), { key: "isActive", label: "활성", type: "boolean", defaultValue: true }] }, edit: { path: (row) => `/admin/v2/banners/${row.id}`, fields: [text("title", "제목", true), text("imageUrl", "이미지 URL", true), { key: "actionType", label: "액션", options: ["NONE", "DEEPLINK", "WEB", "CUSTOM"] }, text("actionValue", "액션 값"), text("linkUrl", "링크 URL"), number("sortOrder", "순서"), { key: "isActive", label: "활성", type: "boolean" }] }, actions: [{ label: "삭제", path: (row) => `/admin/v2/banners/${row.id}`, method: "DELETE", destructive: true }] },
  categories: { key: "categories", title: "파티 카테고리", description: "파티 분류와 앱 노출 순서를 관리합니다.", resource: "party-categories", columns: [{ key: "name", label: "이름" }, { key: "status", label: "상태" }, { key: "sortOrder", label: "순서" }, { key: "iconUrl", label: "아이콘" }], create: { label: "카테고리 추가", path: "/admin/v2/party-categories", fields: [text("name", "이름", true), { key: "status", label: "상태", options: ["ACTIVE", "FIXED", "HIDDEN"], defaultValue: "ACTIVE" }, number("sortOrder", "순서"), text("iconUrl", "아이콘 URL")] }, edit: { path: (row) => `/admin/v2/party-categories/${row.id}`, fields: [text("name", "이름", true), { key: "status", label: "상태", options: ["ACTIVE", "FIXED", "HIDDEN"] }, number("sortOrder", "순서"), text("iconUrl", "아이콘 URL")] }, actions: [{ label: "숨김", path: (row) => `/admin/v2/party-categories/${row.id}`, method: "DELETE", destructive: true, hidden: (row) => row.status === "HIDDEN" }] },
  "review-tag-categories": { key: "review-tag-categories", title: "리뷰 태그 그룹", description: "리뷰 태그 그룹을 관리합니다.", resource: "review-tag-categories", columns: [{ key: "name", label: "이름" }, { key: "sortOrder", label: "순서" }], create: { label: "그룹 추가", path: "/admin/v2/review-tag-categories", fields: [text("name", "이름", true), number("sortOrder", "순서")] }, edit: { path: (row) => `/admin/v2/review-tag-categories/${row.id}`, fields: [text("name", "이름", true), number("sortOrder", "순서")] }, actions: [{ label: "삭제", path: (row) => `/admin/v2/review-tag-categories/${row.id}`, method: "DELETE", destructive: true }] },
  "review-tags": { key: "review-tags", title: "리뷰 태그", description: "사용자 리뷰에 표시되는 태그를 관리합니다.", resource: "review-tags", columns: [{ key: "category", label: "그룹" }, { key: "label", label: "태그" }, { key: "sortOrder", label: "순서" }, { key: "isActive", label: "활성" }], create: { label: "태그 추가", path: "/admin/v2/review-tags", fields: [text("categoryId", "그룹 ID", true), text("label", "태그", true), number("sortOrder", "순서"), { key: "isActive", label: "활성", type: "boolean", defaultValue: true }] }, edit: { path: (row) => `/admin/v2/review-tags/${row.id}`, fields: [text("categoryId", "그룹 ID", true), text("label", "태그", true), number("sortOrder", "순서"), { key: "isActive", label: "활성", type: "boolean" }] }, actions: [{ label: "비활성화", path: (row) => `/admin/v2/review-tags/${row.id}`, method: "DELETE", destructive: true, hidden: (row) => row.isActive === false }] },
  config: { key: "config", title: "런타임 설정", description: "운영 설정을 변경합니다. 모든 변경은 감사 로그에 기록됩니다.", resource: "config", columns: [{ key: "key", label: "키" }, { key: "value", label: "값" }, { key: "description", label: "설명" }, { key: "updatedBy", label: "수정자" }, { key: "updatedAt", label: "수정일" }], create: { label: "설정 추가", path: (values) => `/admin/v2/config/${encodeURIComponent(String(values.key))}`, fields: [text("key", "키", true), text("value", "값", true), { key: "description", label: "설명", type: "textarea" }] }, edit: { path: (row) => `/admin/v2/config/${encodeURIComponent(String(row.key))}`, fields: [text("value", "값", true), { key: "description", label: "설명", type: "textarea" }] } },
};
