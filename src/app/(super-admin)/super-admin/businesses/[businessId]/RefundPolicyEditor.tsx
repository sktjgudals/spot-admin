"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

export interface RefundTierRow {
  hoursBeforeStart: number;
  refundPercent: number;
}

interface Props {
  businessId: string;
  initialTiers: RefundTierRow[];
}

/** 기본 규정 안내 (백엔드 DEFAULT_REFUND_TIERS와 동일). */
const DEFAULT_HINT =
  "규정을 비워 두면 기본값(시작 7일 전 100% / 3일 전 50% / 그 외 0%)이 적용됩니다.";

/**
 * 업체별 환불 규정 단계 편집 UI.
 * "파티 시작 N시간 이상 남았을 때 X% 환불" 형태의 행을 추가/삭제/저장.
 */
export default function RefundPolicyEditor({ businessId, initialTiers }: Props) {
  const router = useRouter();
  const [tiers, setTiers] = useState<RefundTierRow[]>(
    initialTiers.length > 0
      ? initialTiers
      : [],
  );
  const [loading, setLoading] = useState(false);

  const update = (index: number, patch: Partial<RefundTierRow>) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addTier = () => {
    setTiers((prev) => [...prev, { hoursBeforeStart: 24, refundPercent: 0 }]);
  };

  const removeTier = (index: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    for (const t of tiers) {
      if (!Number.isInteger(t.hoursBeforeStart) || t.hoursBeforeStart < 0) {
        return toast.error("남은 시간(시간)은 0 이상 정수여야 합니다");
      }
      if (
        !Number.isInteger(t.refundPercent) ||
        t.refundPercent < 0 ||
        t.refundPercent > 100
      ) {
        return toast.error("환불 비율은 0~100 사이 정수여야 합니다");
      }
    }

    setLoading(true);
    const res = await fetch(
      `/api/super-admin/businesses/${businessId}/refund-policy`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers }),
      },
    );
    setLoading(false);

    if (res.ok) {
      toast.success("환불 규정을 저장했습니다");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.message ?? "저장에 실패했습니다");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">환불 규정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          파티 시작까지 남은 시간 기준으로 환불 비율을 정합니다. 조건을 만족하는
          단계 중 가장 높은 비율이 적용됩니다. {DEFAULT_HINT}
        </p>

        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/40">
            등록된 규정이 없습니다. 기본 규정이 적용됩니다.
          </p>
        ) : (
          <div className="space-y-3">
            {tiers.map((tier, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row gap-3 sm:items-end border rounded-md p-3"
              >
                <div className="flex-1 space-y-1.5">
                  <Label>시작 N시간 전</Label>
                  <Input
                    type="number"
                    min={0}
                    value={tier.hoursBeforeStart}
                    onChange={(e) =>
                      update(i, {
                        hoursBeforeStart: Number(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {tier.hoursBeforeStart >= 24 &&
                    tier.hoursBeforeStart % 24 === 0
                      ? `≈ ${tier.hoursBeforeStart / 24}일`
                      : `${tier.hoursBeforeStart}시간`}{" "}
                    이상 남았을 때
                  </p>
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>환불 비율 (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.refundPercent}
                    onChange={(e) =>
                      update(i, { refundPercent: Number(e.target.value) })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeTier(i)}
                  aria-label="단계 삭제"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addTier} disabled={loading}>
            <Plus className="w-4 h-4 mr-1" />
            단계 추가
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading}>
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
