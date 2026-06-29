"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

export default function ApplicationActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handle = async (action: "approve" | "reject") => {
    setLoading(true);
    const res = await fetch(`/api/business/applications/${applicationId}/${action}`, {
      method: "POST",
    });
    setLoading(false);

    if (res.ok) {
      toast.success(action === "approve" ? "승인되었습니다" : "거절되었습니다");
      router.refresh();
    } else {
      toast.error("처리에 실패했습니다");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-green-600 border-green-300 hover:bg-green-50"
        onClick={() => handle("approve")}
        disabled={loading}
      >
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-destructive border-red-200 hover:bg-red-50"
        onClick={() => handle("reject")}
        disabled={loading}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
