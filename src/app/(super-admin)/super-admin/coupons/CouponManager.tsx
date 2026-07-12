"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Kind = "CLAIMABLE" | "SYSTEM";
type CouponStatus = "ACTIVE" | "USED" | "EXPIRED";

const KIND_LABEL: Record<Kind, string> = {
  CLAIMABLE: "받아가는 쿠폰",
  SYSTEM: "시스템 쿠폰",
};

const STATUS_LABEL: Record<CouponStatus, string> = {
  ACTIVE: "사용 가능",
  USED: "사용됨",
  EXPIRED: "만료",
};

interface TemplateItem {
  id: string;
  title: string;
  description: string | null;
  discountAmount: number;
  validDays: number;
  kind: Kind;
  isActive: boolean;
  issuedCount: number;
}

interface IssueItem {
  id: string;
  status: CouponStatus;
  source: string;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
  email: string;
  nickname: string;
}

interface Props {
  initialTemplates: TemplateItem[];
}

export default function CouponManager({ initialTemplates }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountAmount, setDiscountAmount] = useState(3000);
  const [validDays, setValidDays] = useState(30);
  const [kind, setKind] = useState<Kind>("CLAIMABLE");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editItem, setEditItem] = useState<TemplateItem | null>(null);
  const [historyItem, setHistoryItem] = useState<TemplateItem | null>(null);

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("쿠폰 이름을 입력해주세요");
      return;
    }
    if (!Number.isInteger(discountAmount) || discountAmount <= 0) {
      toast.error("할인 금액은 1원 이상 정수여야 합니다");
      return;
    }
    if (!Number.isInteger(validDays) || validDays <= 0) {
      toast.error("유효 일수는 1일 이상이어야 합니다");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/super-admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          discountAmount,
          validDays,
          kind,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "등록 실패");
      setTemplates((prev) => [{ ...data, issuedCount: 0 }, ...prev]);
      setTitle("");
      setDescription("");
      setDiscountAmount(3000);
      setValidDays(30);
      setKind("CLAIMABLE");
      toast.success("쿠폰이 등록되었습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/coupons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "수정 실패");
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...data } : t))
      );
      toast.success("저장되었습니다");
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정 실패");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: TemplateItem) {
    if (!confirm(`"${item.title}" 쿠폰을 삭제할까요?`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/super-admin/coupons/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "삭제 실패");
      }
      setTemplates((prev) => prev.filter((t) => t.id !== item.id));
      toast.success("삭제되었습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  async function handleIssue(item: TemplateItem, email: string) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/super-admin/coupons/${item.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "발급 실패");
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === item.id ? { ...t, issuedCount: t.issuedCount + 1 } : t
        )
      );
      toast.success(data.message ?? "발급했습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "발급 실패");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">새 쿠폰</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px_140px] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>쿠폰 이름 *</Label>
              <Input
                placeholder="예) 첫 파티 3,000원 할인"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>할인 금액(원) *</Label>
              <Input
                type="number"
                min={1}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>유효 일수 *</Label>
              <Input
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>종류</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as Kind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>설명 (선택)</Label>
              <Input
                placeholder="앱 쿠폰 목록에 함께 노출됩니다"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">등록된 쿠폰이 없습니다.</p>
      )}
      {templates.map((t) => (
        <TemplateRow
          key={t.id}
          item={t}
          busy={busyId === t.id}
          onPatch={(body) => patch(t.id, body)}
          onDelete={() => handleDelete(t)}
          onIssue={(email) => handleIssue(t, email)}
          onEdit={() => setEditItem(t)}
          onHistory={() => setHistoryItem(t)}
        />
      ))}

      <EditTemplateDialog
        key={editItem?.id ?? "closed"}
        item={editItem}
        busy={editItem ? busyId === editItem.id : false}
        onClose={() => setEditItem(null)}
        onSave={async (body) => {
          if (!editItem) return;
          const ok = await patch(editItem.id, body);
          if (ok) setEditItem(null);
        }}
      />

      <IssueHistoryDialog
        item={historyItem}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}

function TemplateRow({
  item,
  busy,
  onPatch,
  onDelete,
  onIssue,
  onEdit,
  onHistory,
}: {
  item: TemplateItem;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  onIssue: (email: string) => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{item.title}</span>
          <Badge variant={item.kind === "SYSTEM" ? "secondary" : "outline"}>
            {KIND_LABEL[item.kind]}
          </Badge>
          {!item.isActive && <Badge variant="destructive">비활성</Badge>}
          <span className="text-sm text-muted-foreground">
            {item.discountAmount.toLocaleString()}원 · {item.validDays}일 ·
            발급 {item.issuedCount}장
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
              편집
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onHistory}
            >
              <History className="w-3.5 h-3.5" />
              발급 이력
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onPatch({ isActive: !item.isActive })}
            >
              {item.isActive ? "비활성화" : "활성화"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy || item.issuedCount > 0}
              title={
                item.issuedCount > 0
                  ? "발급된 쿠폰이 있어 삭제할 수 없습니다"
                  : "삭제"
              }
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}
        <div className="flex items-center gap-2">
          <Input
            className="h-8 max-w-[260px]"
            placeholder="유저 이메일로 직접 발급"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !email.trim() || !item.isActive}
            onClick={() => {
              onIssue(email.trim());
              setEmail("");
            }}
          >
            <Send className="w-4 h-4" />
            발급
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditTemplateDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: TemplateItem | null;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [discountAmount, setDiscountAmount] = useState(
    item?.discountAmount ?? 0
  );
  const [validDays, setValidDays] = useState(item?.validDays ?? 30);
  const [kind, setKind] = useState<Kind>(item?.kind ?? "CLAIMABLE");

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>쿠폰 편집</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>쿠폰 이름 *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>설명</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>할인 금액(원)</Label>
              <Input
                type="number"
                min={1}
                value={discountAmount}
                onChange={(e) =>
                  setDiscountAmount(Number(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>유효 일수</Label>
              <Input
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>종류</Label>
            <Select value={kind} onValueChange={(v) => v && setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            disabled={busy || !title.trim()}
            onClick={() =>
              onSave({
                title: title.trim(),
                description: description.trim() || null,
                discountAmount,
                validDays,
                kind,
              })
            }
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueHistoryDialog({
  item,
  onClose,
}: {
  item: TemplateItem | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<IssueItem[]>([]);

  useEffect(() => {
    if (!item) {
      setIssues([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/super-admin/coupons/${item.id}/issues`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "조회 실패");
        if (!cancelled) setIssues(data);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "조회 실패");
          setIssues([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            발급 이력{item ? ` — ${item.title}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[360px] overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && issues.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              발급 이력이 없습니다.
            </p>
          )}
          {!loading && issues.length > 0 && (
            <ul className="divide-y text-sm">
              {issues.map((c) => (
                <li key={c.id} className="py-2.5 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.email}</span>
                    <Badge variant="outline" className="text-xs font-normal">
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.nickname} · 발급{" "}
                    {new Date(c.issuedAt).toLocaleString("ko-KR")} · 만료{" "}
                    {new Date(c.expiresAt).toLocaleDateString("ko-KR")}
                    {c.usedAt &&
                      ` · 사용 ${new Date(c.usedAt).toLocaleString("ko-KR")}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
