"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface BannerItem {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface Props {
  initialBanners: BannerItem[];
}

export default function BannerManager({ initialBanners }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [banners, setBanners] = useState(initialBanners);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/super-admin/banners/upload", {
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
    setCreating(true);
    try {
      const res = await fetch("/api/super-admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), imageUrl, linkUrl: linkUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "등록 실패");
      setBanners((prev) => [...prev, data]);
      setTitle("");
      setLinkUrl("");
      setImageUrl("");
      toast.success("배너가 등록되었습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(banner: BannerItem) {
    const res = await fetch(`/api/super-admin/banners/${banner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !banner.isActive }),
    });
    if (!res.ok) {
      toast.error("변경 실패");
      return;
    }
    setBanners((prev) =>
      prev.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b))
    );
    router.refresh();
  }

  async function handleDelete(banner: BannerItem) {
    if (!confirm(`"${banner.title}" 배너를 삭제할까요?`)) return;
    const res = await fetch(`/api/super-admin/banners/${banner.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("삭제 실패");
      return;
    }
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    toast.success("삭제되었습니다");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* 새 배너 등록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 배너 등록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="banner-title">제목</Label>
              <Input
                id="banner-title"
                placeholder="예: 7월 솔로파티 오픈"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banner-link">링크 URL (선택)</Label>
              <Input
                id="banner-link"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
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
        {banners.map((banner) => (
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
              {banner.linkUrl && (
                <p className="text-xs text-muted-foreground truncate">{banner.linkUrl}</p>
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
        ))}
      </div>
    </div>
  );
}
