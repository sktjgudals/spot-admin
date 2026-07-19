"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 파티 Soft Close — 결제·채팅 기록은 보존, 목록/참가 차단 + 채팅방 kick.
 */
export default function ClosePartyButton({
  partyId,
  partyTitle,
  isActive,
  endpoint,
}: {
  partyId: string;
  partyTitle?: string;
  isActive: boolean;
  endpoint?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isActive) return null;

  const close = async () => {
    if (loading) return;
    const label = partyTitle ? `"${partyTitle}" ` : "";
    if (
      !window.confirm(
        `${label}파티를 강제 종료할까요?\n\n목록·신규 참가가 차단됩니다.\n결제·채팅 기록은 보존됩니다.`
      )
    ) {
      return;
    }
    setLoading(true);
    const closeEndpoint = endpoint ?? `/api/super-admin/parties/${partyId}/close`;
    const res = await fetch(closeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "관리자에 의해 종료됨" }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      toast.success("파티를 종료했어요. 채팅 참여자는 퇴장 처리됩니다.");
      router.refresh();
    } else {
      toast.error(data?.message ?? "파티 종료에 실패했습니다");
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      className="whitespace-nowrap"
      disabled={loading}
      onClick={close}
    >
      <Ban className="w-3.5 h-3.5" />
      강제 종료
    </Button>
  );
}
