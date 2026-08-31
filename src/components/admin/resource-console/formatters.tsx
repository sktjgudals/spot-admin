import type { ReactNode } from "react";
import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { ResourceConfig } from "@/components/admin/resource-configs";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format-date";

const money = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const statusLabels: Record<string, string> = {
  ACTIONED: "조치 완료",
  ACTION_REQUIRED: "추가 조치",
  ACTIVE: "활성",
  APPROVED: "승인",
  CANCELLED: "취소",
  DISABLED: "비활성",
  DISMISSED: "기각",
  DONE: "완료",
  DRAFT: "초안",
  FAILED: "실패",
  FIXED: "고정",
  HIDDEN: "숨김",
  IN_PROGRESS: "처리 중",
  PARTIAL_CANCELLED: "부분 환불",
  PENDING: "대기",
  PROCESSING: "처리 중",
  QUEUED: "대기열",
  READY: "확인 대기",
  REJECTED: "거절",
  REQUESTED: "요청됨",
  RESOLVED: "처리 완료",
  SENT: "발송 완료",
  SUSPENDED: "정지",
};

function isDateKey(key: string): boolean {
  return /(?:At|Date|date)$/.test(key);
}

function isMoneyKey(key: string): boolean {
  return /(?:amount|price|revenue|fee|cost)/i.test(key);
}

function isStatusKey(key: string): boolean {
  return /(?:status|role|kind|audience|actionType)$/i.test(key);
}

function safeJson(value: object): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "표시할 수 없는 데이터";
  }
}

export function getStatusLabel(value: string): string {
  return statusLabels[value] ?? value;
}

export function getStatusTone(value: string): string {
  if (/^(ACTIVE|APPROVED|DONE|FIXED|RESOLVED|SENT|ACTIONED)$/.test(value)) {
    return "border-success/25 bg-success/10 text-foreground";
  }
  if (/^(PENDING|READY|IN_PROGRESS|PROCESSING|QUEUED|REQUESTED|ACTION_REQUIRED)$/.test(value)) {
    return "border-warning/30 bg-warning/10 text-warning-foreground";
  }
  if (/^(FAILED|REJECTED|SUSPENDED|DISABLED|CANCELLED)$/.test(value)) {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/70 text-muted-foreground";
}

export function formatResourceText(value: unknown, key: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") {
    if (/^is[A-Z]/.test(key)) return value ? "활성" : "비활성";
    if (/required/i.test(key)) return value ? "필수" : "선택";
    return value ? "예" : "아니오";
  }
  if (typeof value === "number") {
    if (isDateKey(key) && value > 1_000_000_000_000) return formatDateTime(value);
    return isMoneyKey(key) ? money.format(value) : value.toLocaleString("ko-KR");
  }
  if (typeof value === "string" && (isDateKey(key) || key === "date")) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return formatDateTime(parsed);
  }
  if (typeof value === "object") return safeJson(value);
  return String(value);
}

export function renderResourceValue(value: unknown, key: string): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Badge variant="outline" className={value ? getStatusTone("ACTIVE") : getStatusTone("DISABLED")}>
        {formatResourceText(value, key)}
      </Badge>
    );
  }
  if (typeof value === "string" && isStatusKey(key)) {
    return (
      <Badge variant="outline" className={getStatusTone(value)} title={value}>
        {getStatusLabel(value)}
      </Badge>
    );
  }
  const text = formatResourceText(value, key);
  if (/(?:^id$|Id$|orderId$|campaignId$)/.test(key)) {
    return <span className="font-mono text-xs tracking-tight">{text}</span>;
  }
  return text;
}

export function summarizeResourceRow(config: ResourceConfig, row: AdminResource): string {
  return config.columns
    .slice(0, 4)
    .map((column) => `${column.label} ${formatResourceText(row[column.key], column.key)}`)
    .join(" · ");
}
