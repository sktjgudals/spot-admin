"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface Business {
  id: string;
  name: string;
}

interface Props {
  partyId: string;
  currentBusinessId: string | null;
  currentBusinessName: string | null;
  businesses: Business[];
}

export default function PartyBusinessMapper({
  partyId,
  currentBusinessId,
  currentBusinessName,
  businesses,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleChange = async (value: string | null) => {
    if (value === null) return;
    setLoading(true);
    const businessId = value === "none" ? null : value;
    const res = await fetch(`/api/super-admin/parties/${partyId}/business`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    });
    setLoading(false);

    if (res.ok) {
      const name = businesses.find((b) => b.id === businessId)?.name;
      toast.success(businessId ? `${name}에 연결됐습니다` : "업체 연결이 해제됐습니다");
      router.refresh();
    } else {
      toast.error("업체 매핑에 실패했습니다");
    }
  };

  return (
    <div className="flex items-center gap-1.5 min-w-[160px]">
      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Select
        value={currentBusinessId ?? "none"}
        onValueChange={handleChange}
        disabled={loading}
      >
        <SelectTrigger className="h-7 text-xs border-dashed">
          <SelectValue placeholder="업체 미연결">
            {currentBusinessName ?? "미연결"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs text-muted-foreground">
            미연결
          </SelectItem>
          {businesses.map((b) => (
            <SelectItem key={b.id} value={b.id} className="text-xs">
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
