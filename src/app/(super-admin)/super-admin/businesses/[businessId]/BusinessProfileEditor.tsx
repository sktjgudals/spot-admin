"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type BusinessProfileFields = {
  name: string;
  tagline: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  businessNumber: string | null;
};

export default function BusinessProfileEditor({
  businessId,
  initial,
}: {
  businessId: string;
  initial: BusinessProfileFields;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initial.name,
    tagline: initial.tagline ?? "",
    description: initial.description ?? "",
    contactEmail: initial.contactEmail ?? "",
    contactPhone: initial.contactPhone ?? "",
    address: initial.address ?? "",
    businessNumber: initial.businessNumber ?? "",
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("업체명은 필수입니다");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/super-admin/businesses/${businessId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        description: form.description.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        address: form.address.trim() || null,
        businessNumber: form.businessNumber.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "저장에 실패했습니다");
      return;
    }
    toast.success("업체 프로필이 저장되었습니다");
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="space-y-1.5">
        <Label>업체명 *</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>한줄 소개</Label>
        <Input
          value={form.tagline}
          onChange={(e) => set("tagline", e.target.value)}
          placeholder="앱에 노출되는 태그라인"
        />
      </div>
      <div className="space-y-1.5">
        <Label>소개</Label>
        <Textarea
          rows={4}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>연락 이메일</Label>
          <Input
            type="email"
            value={form.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>연락처</Label>
          <Input
            value={form.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>주소</Label>
        <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>사업자번호</Label>
        <Input
          value={form.businessNumber}
          onChange={(e) => set("businessNumber", e.target.value)}
        />
      </div>
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "저장 중..." : "프로필 저장"}
        </Button>
      </div>
    </form>
  );
}
