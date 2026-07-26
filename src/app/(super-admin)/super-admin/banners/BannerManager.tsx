"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
import { fetchJson, bffFetch } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import {
  BANNER_ACTION_HINTS,
  BANNER_ACTION_LABELS,
  BANNER_ACTION_PLACEHOLDERS,
  BANNER_ACTION_TYPES,
  type BannerActionType,
} from "@/lib/banner-actions";

interface BannerItem {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  actionType: string | null;
  actionValue: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface Props {
  initialBanners: BannerItem[];
}

export default function BannerManager({ initialBanners }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: banners = [] } = useQuery({
    queryKey: queryKeys.banners,
    queryFn: () => fetchJson<BannerItem[]>("/api/super-admin/banners"),
    initialData: initialBanners,
  });

  const [title, setTitle] = useState("");
  const [actionType, setActionType] = useState<BannerActionType>("WEB");
  const [actionValue, setActionValue] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.banners });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await bffFetch("/api/super-admin/banners/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "업로드 실패");
      setImageUrl(data.url);
      toast.success("이미지 업로드 완료");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCreate() {
    if (!title.trim() || !imageUrl) {
      toast.error("제목과 이미지를 입력해주세요");
      return;
    }
    if (actionType !== "NONE" && !actionValue.trim()) {
      toast.error("액션 값을 입력해주세요");
      return;
    }
    setCreating(true);
    try {
      const res = await bffFetch("/api/super-admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          imageUrl,
          actionType,
          actionValue: actionType === "NONE" ? null : actionValue.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "등록 실패");
      setTitle("");
      setActionType("WEB");
      setActionValue("");
      setImageUrl("");
      toast.success("배너가 등록되었습니다");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(banner: BannerItem) {
    const res = await bffFetch(`/api/super-admin/banners/${banner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !banner.isActive }),
    });
    if (!res.ok) {
      toast.error("변경 실패");
      return;
    }
    await invalidate();
  }

  async function handleDelete(banner: BannerItem) {
    if (!confirm(`"${banner.title}" 배너를 삭제할까요?`)) return;
    const res = await bffFetch(`/api/super-admin/banners/${banner.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
    await invalidate();
  }

  function destinationLabel(banner: BannerItem): string | null {
    if (banner.actionValue) return banner.actionValue;
    if (banner.linkUrl) return banner.linkUrl;
    return null;
  }

  function actionLabel(banner: BannerItem): string {
    const t = (banner.actionType ?? "").toUpperCase() as BannerActionType;
    if (t && BANNER_ACTION_LABELS[t]) return BANNER_ACTION_LABELS[t];
    if (banner.linkUrl) return "링크(레거시)";
    return "없음";
  }

  return (
    <div className="space-y-4">
      {/* 새 배너 등록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 배너 등록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="banner-title">제목</Label>
            <Input
              id="banner-title"
              placeholder="예: 7월 솔로파티 오픈"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>액션 타입</Label>
              <Select
                value={actionType}
                onValueChange={(v) => {
                  if (v == null) return;
                  setActionType(v as BannerActionType);
                  if (v === "NONE") setActionValue("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANNER_ACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {BANNER_ACTION_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {BANNER_ACTION_HINTS[actionType]}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banner-action-value">
                액션 값 {actionType === "NONE" ? "(불필요)" : ""}
              </Label>
              <Input
                id="banner-action-value"
                placeholder={BANNER_ACTION_PLACEHOLDERS[actionType]}
                value={actionValue}
                disabled={actionType === "NONE"}
                onChange={(e) => setActionValue(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>배너 이미지 (16:9 권장, 10MB 이하)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="배너 미리보기"
                className="w-full max-w-md aspect-video object-cover rounded-md border"
              />
            ) : null}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 mr-2" />
                )}
                {imageUrl ? "이미지 변경" : "이미지 업로드"}
              </Button>
            </div>
          </div>

          <Button onClick={handleCreate} disabled={creating || uploading}>
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            배너 등록
          </Button>
        </CardContent>
      </Card>

      {/* 배너 목록 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {banners.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            등록된 배너가 없습니다.
          </p>
        )}
        {banners.map((banner) => {
          const dest = destinationLabel(banner);
          return (
            <Card key={banner.id} className="overflow-hidden py-0 gap-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={banner.imageUrl}
                alt={banner.title}
                className="w-full aspect-video object-cover"
              />
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{banner.title}</p>
                  <Badge variant={banner.isActive ? "default" : "secondary"}>
                    {banner.isActive ? "활성" : "비활성"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {actionLabel(banner)}
                  </Badge>
                </div>
                {dest && (
                  <p className="text-xs text-muted-foreground truncate" title={dest}>
                    {dest}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleToggleActive(banner)}
                  >
                    {banner.isActive ? "비활성화" : "활성화"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(banner)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
