"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface InquiryItem {
  id: string;
  nickname: string;
  email: string;
  message: string;
  contact: string | null;
  isResolved: boolean;
  createdAt: string;
}

interface Props {
  initialItems: InquiryItem[];
}

export default function InquiryList({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(item: InquiryItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/super-admin/inquiries/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isResolved: !item.isResolved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "변경 실패");
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, isResolved: data.isResolved } : i
        )
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">접수된 문의가 없습니다.</p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((i) => (
        <Card key={i.id} className={i.isResolved ? "opacity-60" : undefined}>
          <CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{i.nickname}</span>
              <span className="text-xs text-muted-foreground">{i.email}</span>
              {i.isResolved ? (
                <Badge variant="secondary" className="text-xs">처리완료</Badge>
              ) : (
                <Badge className="text-xs">미처리</Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(i.createdAt).toLocaleString("ko-KR")}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{i.message}</p>
            {i.contact && (
              <p className="text-xs text-muted-foreground">
                회신 연락처: {i.contact}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                variant={i.isResolved ? "outline" : "default"}
                size="sm"
                disabled={busyId === i.id}
                onClick={() => toggle(i)}
              >
                {i.isResolved ? "미처리로 되돌리기" : "처리완료"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
