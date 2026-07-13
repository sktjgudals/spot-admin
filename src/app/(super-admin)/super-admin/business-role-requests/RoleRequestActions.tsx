"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function RoleRequestActions({
  requestId,
  businesses,
}: {
  requestId: string;
  businesses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [businessId, setBusinessId] = useState("");

  const approve = async () => {
    if (loading) return;
    setLoading("approve");
    const res = await fetch(
      `/api/super-admin/business-role-requests/${requestId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(businessId ? { businessId } : {}),
      },
    );
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok) {
      toast.success(
        businessId
          ? "기존 업체에 연결해 승인했습니다"
          : "신규 업체를 만들고 승인했습니다",
      );
      router.refresh();
    } else {
      toast.error(data?.message ?? "승인에 실패했습니다");
    }
  };

  const reject = async () => {
    if (loading) return;
    if (!window.confirm("이 신청을 거절할까요?")) return;
    setLoading("reject");
    const res = await fetch(
      `/api/super-admin/business-role-requests/${requestId}/reject`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok) {
      toast.success("거절했습니다");
      router.refresh();
    } else {
      toast.error(data?.message ?? "거절에 실패했습니다");
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <select
        className="h-8 rounded-md border bg-background px-2 text-xs max-w-[220px]"
        value={businessId}
        onChange={(e) => setBusinessId(e.target.value)}
      >
        <option value="">신규 업체 생성</option>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={loading !== null}
          onClick={approve}
        >
          승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading !== null}
          onClick={reject}
        >
          거절
        </Button>
      </div>
    </div>
  );
}
