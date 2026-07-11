"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
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

type Category = "CONVERSATION" | "MOOD" | "MANNER";

const CATEGORY_LABEL: Record<Category, string> = {
  CONVERSATION: "대화",
  MOOD: "분위기",
  MANNER: "매너",
};
const CATEGORY_ORDER: Category[] = ["CONVERSATION", "MOOD", "MANNER"];

interface TagItem {
  id: string;
  category: Category;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

interface Props {
  initialTags: TagItem[];
}

export default function ReviewTagManager({ initialTags }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<Category>("CONVERSATION");
  const [sortOrder, setSortOrder] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function sortTags(list: TagItem[]) {
    return [...list].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category) || a.sortOrder - b.sortOrder
    );
  }

  async function handleCreate() {
    if (!label.trim()) {
      toast.error("태그 문구를 입력해주세요");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/super-admin/review-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), category, sortOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "등록 실패");
      setTags((prev) => sortTags([...prev, data]));
      setLabel("");
      setSortOrder(0);
      toast.success("태그가 등록되었습니다");
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
      const res = await fetch(`/api/super-admin/review-tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "수정 실패");
      setTags((prev) => sortTags(prev.map((t) => (t.id === id ? data : t))));
      router.refresh();
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
      setTags((prev) => prev.filter((t) => t.id !== item.id));
      toast.success("삭제되었습니다");
      router.refresh();
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
                value={category}
                onValueChange={(v) => v && setCategory(v as Category)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
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

      {CATEGORY_ORDER.map((cat) => {
        const group = tags.filter((t) => t.category === cat);
        return (
          <Card key={cat}>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base">
                {CATEGORY_LABEL[cat]}{" "}
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
                      value={t.category}
                      onValueChange={(v) =>
                        v !== t.category && patch(t.id, { category: v })
                      }
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORY_LABEL[c]}
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
