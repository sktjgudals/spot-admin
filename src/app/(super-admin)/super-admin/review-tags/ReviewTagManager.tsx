"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, Check } from "lucide-react";
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
  sortOrder: number;
}

interface TagItem {
  id: string;
  categoryId: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

interface Props {
  initialCategories: CategoryItem[];
  initialTags: TagItem[];
}

export default function ReviewTagManager({
  initialCategories,
  initialTags,
}: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.reviewTagCategories,
    queryFn: () =>
      fetchJson<CategoryItem[]>("/api/super-admin/review-tag-categories"),
    initialData: initialCategories,
  });
  const { data: tags = [] } = useQuery({
    queryKey: queryKeys.reviewTags,
    queryFn: () => fetchJson<TagItem[]>("/api/super-admin/review-tags"),
    initialData: initialTags,
  });

  // 새 태그 폼
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategories[0]?.id ?? "");
  const [sortOrder, setSortOrder] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 새 카테고리 폼
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const selectedCategoryId = categoryId || categories[0]?.id || "";

  async function invalidateCategories() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.reviewTagCategories,
    });
  }

  async function invalidateTags() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.reviewTags });
  }

  // ---------- 카테고리 ----------

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("카테고리 이름을 입력해주세요");
      return;
    }
    setCreatingCategory(true);
    try {
      const data = await fetchJson<CategoryItem>(
        "/api/super-admin/review-tag-categories",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            sortOrder:
              (categories[categories.length - 1]?.sortOrder ?? -1) + 1,
          }),
        },
      );
      if (!categoryId) setCategoryId(data.id);
      setNewCategoryName("");
      toast.success("카테고리가 등록되었습니다");
      await invalidateCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function patchCategory(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/review-tag-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "수정 실패");
      toast.success("수정되었습니다");
      await invalidateCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteCategory(item: CategoryItem) {
    if (!confirm(`"${item.name}" 카테고리를 삭제할까요?`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(
        `/api/super-admin/review-tag-categories/${item.id}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "삭제 실패");
      }
      toast.success("삭제되었습니다");
      await invalidateCategories();
      await invalidateTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  // ---------- 태그 ----------

  async function handleCreate() {
    if (!label.trim()) {
      toast.error("태그 문구를 입력해주세요");
      return;
    }
    if (!selectedCategoryId) {
      toast.error("카테고리를 선택해주세요");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/super-admin/review-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          categoryId: selectedCategoryId,
          sortOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "등록 실패");
      setLabel("");
      setSortOrder(0);
      toast.success("태그가 등록되었습니다");
      await invalidateTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/review-tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "수정 실패");
      await invalidateTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: TagItem) {
    if (!confirm(`"${item.label}" 태그를 삭제할까요?`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/super-admin/review-tags/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "삭제 실패");
      }
      toast.success("삭제되었습니다");
      await invalidateTags();
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
          <CardTitle className="text-base">카테고리</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-2">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              item={c}
              busy={busyId === c.id}
              tagCount={tags.filter((t) => t.categoryId === c.id).length}
              onSave={(body) => patchCategory(c.id, body)}
              onDelete={() => handleDeleteCategory(c)}
            />
          ))}
          <div className="flex items-end gap-3 pt-2">
            <div className="space-y-1.5 flex-1">
              <Label>새 카테고리 이름</Label>
              <Input
                placeholder="예) 대화"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            <Button onClick={handleCreateCategory} disabled={creatingCategory}>
              {creatingCategory && <Loader2 className="w-4 h-4 animate-spin" />}
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">새 태그</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_120px_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>문구</Label>
              <Input
                placeholder="예) 대화가 잘 통해요"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>카테고리</Label>
              <Select
                value={selectedCategoryId}
                onValueChange={(v) => v && setCategoryId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
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

      {categories.map((cat) => {
        const group = tags.filter((t) => t.categoryId === cat.id);
        return (
          <Card key={cat.id}>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base">
                {cat.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({group.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-2">
              {group.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  이 카테고리에 태그가 없습니다.
                </p>
              )}
              {group.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
                >
                  <span className="font-medium">{t.label}</span>
                  {!t.isActive && <Badge variant="destructive">비활성</Badge>}
                  <span className="text-xs text-muted-foreground">
                    순서 {t.sortOrder}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Select
                      value={t.categoryId}
                      onValueChange={(v) =>
                        v !== t.categoryId && patch(t.id, { categoryId: v })
                      }
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === t.id}
                      onClick={() => patch(t.id, { isActive: !t.isActive })}
                    >
                      {t.isActive ? "비활성화" : "활성화"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === t.id}
                      onClick={() => handleDelete(t)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** 카테고리 한 줄 — 이름·정렬 수정(변경 시 저장 버튼 활성), 태그 없을 때만 삭제 가능 */
function CategoryRow({
  item,
  busy,
  tagCount,
  onSave,
  onDelete,
}: {
  item: CategoryItem;
  busy: boolean;
  tagCount: number;
  onSave: (body: { name?: string; sortOrder?: number }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [sortOrder, setSortOrder] = useState(item.sortOrder);
  const dirty =
    name.trim() !== item.name || sortOrder !== item.sortOrder;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <Input
        className="h-8 w-[160px]"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className="h-8 w-[80px]"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
      />
      <span className="text-xs text-muted-foreground">태그 {tagCount}개</span>
      <div className="ml-auto flex items-center gap-1">
        {dirty && (
          <Button
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), sortOrder })}
          >
            <Check className="w-4 h-4" />
            저장
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || tagCount > 0}
          title={tagCount > 0 ? "태그를 먼저 삭제하거나 이동하세요" : "삭제"}
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
