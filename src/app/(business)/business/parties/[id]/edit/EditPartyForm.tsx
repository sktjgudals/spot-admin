"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { PartyImageUploader } from "@/components/party-image-uploader";

interface FormFieldItem {
  id: string;
  label: string;
  type: string;
  required: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface Defaults {
  title: string;
  description: string;
  date: string;
  location: string;
  maxCapacity: number;
  priceMale: number;
  priceFemale: number;
  genderRatio: string;
  categoryId: string;
  admissionMode: "INSTANT" | "APPROVAL";
  coverImage: string;
  images: string[];
  isActive: boolean;
  formFieldIds: string[];
}

export default function EditPartyForm({
  partyId,
  formFields,
  categories,
  defaults,
}: {
  partyId: string;
  formFields: FormFieldItem[];
  categories: CategoryItem[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Defaults>(defaults);

  const set = <K extends keyof Defaults>(key: K, value: Defaults[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleField = (id: string) =>
    set(
      "formFieldIds",
      form.formFieldIds.includes(id)
        ? form.formFieldIds.filter((f) => f !== id)
        : [...form.formFieldIds, id]
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/business/parties/${partyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date: new Date(form.date).toISOString(),
      }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("파티가 수정되었습니다");
      router.push("/business/parties");
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "수정에 실패했습니다");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href="/business/parties" />}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">파티 수정</h1>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">파티 정보</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <form onSubmit={onSubmit} className="space-y-4">
            {/* 노출/비노출 */}
            <label className="flex items-center justify-between rounded-md border p-3">
              <div>
                <span className="text-sm font-medium">파티 노출</span>
                <p className="text-xs text-muted-foreground">
                  끄면 앱 목록에서 숨겨집니다 (신청/상세는 유지).
                </p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
            </label>

            <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
              운영 주체는 업체입니다. 앱에는 업체 프로필만 노출됩니다.
            </p>

            <div className="space-y-1.5">
              <Label>파티명 *</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>파티 소개 *</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>일시 *</Label>
                <Input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>최대 인원 *</Label>
                <Input
                  type="number"
                  min={2}
                  value={form.maxCapacity}
                  onChange={(e) => set("maxCapacity", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>장소 *</Label>
              <Input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>남성 참가비 (원)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.priceMale}
                  onChange={(e) => set("priceMale", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>여성 참가비 (원)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.priceFemale}
                  onChange={(e) => set("priceFemale", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>카테고리</Label>
                <Select
                  value={form.categoryId || "none"}
                  onValueChange={(v) =>
                    v && set("categoryId", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="미지정" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">미지정</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>성비</Label>
                <Input
                  value={form.genderRatio}
                  onChange={(e) => set("genderRatio", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>입장 방식</Label>
                <Select
                  value={form.admissionMode}
                  onValueChange={(v) =>
                    v && set("admissionMode", v as "INSTANT" | "APPROVAL")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVAL">승인 후 입장</SelectItem>
                    <SelectItem value="INSTANT">즉시 입장</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>커버 이미지</Label>
              <PartyImageUploader
                mode="single"
                value={form.coverImage}
                onChange={(url) => set("coverImage", url)}
                uploadUrl="/api/business/parties/media-upload-url"
              />
            </div>

            <div className="space-y-1.5">
              <Label>상세 이미지</Label>
              <PartyImageUploader
                mode="multiple"
                value={form.images}
                onChange={(urls) => set("images", urls)}
                uploadUrl="/api/business/parties/media-upload-url"
                maxFiles={10}
              />
            </div>

            {/* 신청 폼 선택 */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label>신청 폼 질문</Label>
                <Link href="/business/forms" className="text-xs text-primary underline">
                  질문 관리
                </Link>
              </div>
              {formFields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  등록된 질문이 없습니다.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {formFields.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={form.formFieldIds.includes(f.id)}
                        onChange={() => toggleField(f.id)}
                      />
                      {f.label}
                      {f.required && <span className="text-xs text-destructive">필수</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                취소
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
