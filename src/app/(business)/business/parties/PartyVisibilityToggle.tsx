"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function PartyVisibilityToggle({
  partyId,
  initialVisible,
}: {
  partyId: string;
  initialVisible: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const visible = optimistic ?? initialVisible;

  const toggle = async () => {
    const next = !visible;
    setSaving(true);
    setOptimistic(next);
    const res = await fetch(`/api/business/parties/${partyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(next ? "노출로 변경했습니다" : "비노출로 변경했습니다");
      router.refresh();
    } else {
      setOptimistic(null);
      toast.error("변경에 실패했습니다");
    }
  };

  return (
    <button type="button" onClick={toggle} disabled={saving} className="disabled:opacity-60">
      {visible ? (
        <Badge variant="secondary" className="text-xs whitespace-nowrap cursor-pointer">
          노출 중
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer"
        >
          비노출
        </Badge>
      )}
    </button>
  );
}
