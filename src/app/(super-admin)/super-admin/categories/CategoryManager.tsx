"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pin, PinOff, Trash2 } from "lucide-react";
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
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";

interface CategoryItem {
  id: string;
  name: string;
  status: "FIXED" | "NORMAL";
  sortOrder: number;
  isActive: boolean;
  partyCount: number;
}

interface Props {
  initialCategories: CategoryItem[];
}

export default function CategoryManager({ initialCategories }: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.partyCategories,
    queryFn: () =>
      fetchJson<CategoryItem[]>("/api/super-admin/party-categories"),
    initialData: initialCategories,
  });
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"FIXED" | "NORMAL">("NORMAL");
  const [sortOrder, setSortOrder] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.partyCategories });
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("카테고리 이름을 입력해주세요");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/super-admin/party-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), status, sortOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "등록 실패");
      setName("");
      setStatus("NORMAL");
      setSortOrder(0);
      toast.success("카테고리가 등록되었습니다");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/party-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "수정 실패");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: CategoryItem) {
    const warn =
      item.partyCount > 0
        ? `연결된 파티 ${item.partyCount}개의 카테고리 연결이 해제됩니다.\n`
        : "";
    if (!confirm(`"${item.name}" 카테고리를 삭제할까요?\n${warn}`)) return;

    setBusyId(item.id);
    try {
      const res = await fetch(`/api/super-admin/party-categories/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "삭제 실패");
      }
      toast.success("삭제되었습니다");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">새 카테고리</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_120px_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>이름</Label>
              <Input
                placeholder="예) 솔로파티"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>메인 노출</Label>
              <Select
                value={status}
                onValueChange={(v) => v && setStatus(v as "FIXED" | "NORMAL")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">메인 노출 (FIXED)</SelectItem>
                  <SelectItem value="NORMAL">일반</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>노출 순서</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">카테고리 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              등록된 카테고리가 없습니다.
            </p>
          )}
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
            >
              <span className="font-medium">{c.name}</span>
              {c.status === "FIXED" ? (
                <Badge>메인 노출</Badge>
              ) : (
                <Badge variant="secondary">일반</Badge>
              )}
              {!c.isActive && <Badge variant="destructive">비활성</Badge>}
              <span className="text-xs text-muted-foreground">
                순서 {c.sortOrder} · 파티 {c.partyCount}개
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === c.id}
                  onClick={() =>
                    patch(c.id, {
                      status: c.status === "FIXED" ? "NORMAL" : "FIXED",
                    })
                  }
                >
                  {c.status === "FIXED" ? (
                    <>
                      <PinOff className="w-3.5 h-3.5" /> 메인 해제
                    </>
                  ) : (
                    <>
                      <Pin className="w-3.5 h-3.5" /> 메인 노출
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === c.id}
                  onClick={() => patch(c.id, { isActive: !c.isActive })}
                >
                  {c.isActive ? "비활성화" : "활성화"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === c.id}
                  onClick={() => handleDelete(c)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
