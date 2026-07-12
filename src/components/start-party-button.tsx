"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "파티 시작" 버튼 — 참여확정(APPROVED) 유저 전원 + 호스트로 파티 채팅방을 개설한다.
 * endpoint는 슈퍼어드민/업체어드민에 따라 다르게 넘긴다 (백엔드 내부 API로 프록시).
 */
export default function StartPartyButton({
  endpoint,
  partyTitle,
}: {
  endpoint: string;
  partyTitle?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (loading) return;
    const label = partyTitle ? `"${partyTitle}" ` : "";
    if (
      !window.confirm(
        `${label}파티를 시작할까요?\n참여확정 유저와 호스트로 채팅방이 개설됩니다.`
      )
    ) {
      return;
    }
    setLoading(true);
    const res = await fetch(endpoint, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      toast.success(`파티를 시작했어요 — 채팅방 개설 (참여 ${data.memberCount ?? "?"}명)`);
      router.refresh();
    } else {
      toast.error(data?.message ?? "파티 시작에 실패했습니다");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="whitespace-nowrap"
      disabled={loading}
      onClick={start}
    >
      <MessageSquarePlus className="w-3.5 h-3.5" />
      파티 시작
    </Button>
  );
}
