"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  businessUserReviewQueryKeys,
  createBusinessUserReviewTag,
  listAllBusinessUserReviewTags,
  moderateBusinessUserReview,
  updateBusinessUserReviewTag,
} from "@/auth/api/admin-business-user-review.api";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { SUPER_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function BusinessUserReviewAdminPage() {
  return (
    <RoleGuard allow={SUPER_ADMIN_ONLY}>
      <div className="grid gap-6 xl:grid-cols-2">
        <TagManager />
        <ReviewModeration />
      </div>
    </RoleGuard>
  );
}

function TagManager() {
  const queryClient = useQueryClient();
  const tags = useQuery({
    queryKey: businessUserReviewQueryKeys.superTags,
    queryFn: listAllBusinessUserReviewTags,
  });
  const [label, setLabel] = useState("");
  const [polarity, setPolarity] = useState<"POSITIVE" | "CAUTION">("POSITIVE");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await createBusinessUserReviewTag({
        label: label.trim(),
        polarity,
        sortOrder: (tags.data?.length ?? 0) * 10,
        isActive: true,
      });
      setLabel("");
      await queryClient.invalidateQueries({ queryKey: businessUserReviewQueryKeys.superTags });
      toast.success("업체 전용 태그를 추가했습니다");
    } catch {
      toast.error("태그 추가에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>업체 전용 리뷰 태그</CardTitle>
        <CardDescription>일반 유저 칭찬 태그와 완전히 분리됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="태그 문구" />
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={polarity}
            onChange={(event) => setPolarity(event.target.value as "POSITIVE" | "CAUTION")}
          >
            <option value="POSITIVE">긍정</option>
            <option value="CAUTION">주의</option>
          </select>
          <Button type="button" disabled={saving || !label.trim()} onClick={() => void add()}>
            추가
          </Button>
        </div>
        {tags.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
        {tags.data?.map((tag) => (
          <div key={tag.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span>{tag.label}</span>
              <Badge variant={tag.polarity === "CAUTION" ? "destructive" : "outline"}>
                {tag.polarity === "CAUTION" ? "주의" : "긍정"}
              </Badge>
              {!tag.isActive && <Badge variant="secondary">비활성</Badge>}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void updateBusinessUserReviewTag(tag.id, { isActive: !tag.isActive })
                .then(() => queryClient.invalidateQueries({ queryKey: businessUserReviewQueryKeys.superTags }))
                .catch(() => toast.error("태그 상태 변경에 실패했습니다"))}
            >
              {tag.isActive ? "비활성화" : "활성화"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ReviewModeration() {
  const [reviewId, setReviewId] = useState("");
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [score, setScore] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = async (hidden?: boolean) => {
    if (!reviewId.trim() || !reason.trim()) {
      toast.error("리뷰 ID와 감사 사유가 필요합니다");
      return;
    }
    setSaving(true);
    try {
      await moderateBusinessUserReview(reviewId.trim(), {
        reason: reason.trim(),
        ...(hidden !== undefined ? { hidden } : {}),
        ...(score ? { score: Number(score) } : {}),
        ...(memo ? { memo: memo.trim() } : {}),
      });
      toast.success(hidden === true ? "리뷰를 숨겼습니다" : hidden === false ? "리뷰 숨김을 해제했습니다" : "리뷰를 정정했습니다");
    } catch {
      toast.error("리뷰 조정에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>신고·분쟁 리뷰 조정</CardTitle>
        <CardDescription>물리 삭제 없이 숨김·정정 감사 기록을 남깁니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={reviewId} onChange={(event) => setReviewId(event.target.value)} placeholder="BusinessUserReview ID" />
        <Input value={score} onChange={(event) => setScore(event.target.value)} type="number" min={1} max={5} placeholder="정정 별점 (선택)" />
        <Textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={500} placeholder="정정 메모 (선택)" />
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="감사 사유 (필수)" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saving} variant="destructive" onClick={() => void apply(true)}>숨김</Button>
          <Button type="button" disabled={saving} variant="outline" onClick={() => void apply(false)}>숨김 해제</Button>
          <Button type="button" disabled={saving} onClick={() => void apply()}>내용 정정</Button>
        </div>
      </CardContent>
    </Card>
  );
}
