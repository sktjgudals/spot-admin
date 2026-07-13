"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

type Kind = "INDIVIDUAL" | "COMPANY";

export default function BusinessKindEditor({
  businessId,
  initialKind,
}: {
  businessId: string;
  initialKind: Kind;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [saving, setSaving] = useState(false);

  async function onChange(next: Kind) {
    if (next === kind) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "저장 실패");
      setKind(next);
      toast.success("업체 유형이 저장되었습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5 pb-2">
      <Label htmlFor="business-kind">업체 유형</Label>
      <select
        id="business-kind"
        className="flex h-9 w-full sm:w-56 rounded-md border border-input bg-transparent px-3 text-sm"
        value={kind}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as Kind)}
      >
        <option value="COMPANY">일반 업체</option>
        <option value="INDIVIDUAL">개인 사업자</option>
      </select>
    </div>
  );
}
