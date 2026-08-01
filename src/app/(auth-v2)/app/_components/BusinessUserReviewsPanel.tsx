"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  businessUserReviewQueryKeys,
  createBusinessUserReview,
  getReviewableMembers,
  listBusinessUserReviewTags,
  updateBusinessUserReview,
  type ReviewableMember,
} from "@/auth/api/admin-business-user-review.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function BusinessUserReviewsPanel({ partyId }: { partyId: string }) {
  const members = useQuery({
    queryKey: businessUserReviewQueryKeys.members(partyId),
    queryFn: () => getReviewableMembers(partyId),
  });
  const tags = useQuery({
    queryKey: businessUserReviewQueryKeys.tags,
    queryFn: listBusinessUserReviewTags,
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>참가자 비공개 리뷰</CardTitle>
        <CardDescription>
          리뷰 대상 유저에게는 보이지 않으며, 이후 신청을 받은 다른 업체와 슈퍼관리자만 확인합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(members.isLoading || tags.isLoading) && <p className="text-sm text-muted-foreground">리뷰 대상을 불러오는 중…</p>}
        {(members.isError || tags.isError) && <p className="text-sm text-destructive">리뷰 정보를 불러오지 못했습니다.</p>}
        {members.data?.members.length === 0 && <p className="text-sm text-muted-foreground">승인된 참가자가 없습니다.</p>}
        {members.data?.members.map((member) => (
          <ReviewableMemberCard key={member.userId} partyId={partyId} member={member} tags={tags.data ?? []} />
        ))}
      </CardContent>
    </Card>
  );
}

function ReviewableMemberCard({ partyId, member, tags }: {
  partyId: string;
  member: ReviewableMember;
  tags: Awaited<ReturnType<typeof listBusinessUserReviewTags>>;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const canSubmit = selected.length >= 1 && selected.length <= 5;
  const status = useMemo(() => {
    if (!member.review) return "미작성";
    return member.review.canEdit ? "작성 완료 · 수정 가능" : "작성 완료 · 수정 종료";
  }, [member.review]);

  const toggleEditor = () => {
    if (editing) {
      setScore(5);
      setSelected([]);
      setMemo("");
    } else if (member.review) {
      setScore(member.review.score);
      setSelected(member.review.tagIds);
      setMemo(member.review.memo ?? "");
    }
    setEditing((value) => !value);
  };

  const toggle = (tagId: string) => {
    setSelected((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : current.length < 5
          ? [...current, tagId]
          : current,
    );
  };

  const save = async () => {
    if (!canSubmit) {
      toast.error("태그를 1~5개 선택해 주세요");
      return;
    }
    setSaving(true);
    try {
      const input = { score, tagIds: selected, memo: memo.trim() || undefined };
      if (member.review) await updateBusinessUserReview(partyId, member.userId, input);
      else await createBusinessUserReview(partyId, member.userId, input);
      await qc.invalidateQueries({ queryKey: businessUserReviewQueryKeys.members(partyId) });
      setEditing(false);
      toast.success("비공개 리뷰를 저장했습니다");
    } catch (error) {
      toast.error(error instanceof AdminAuthError ? error.message : "리뷰 저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{member.nickname}</span>
            <Badge variant={member.attendance === "NO_SHOW" ? "destructive" : "outline"}>{member.attendance === "NO_SHOW" ? "노쇼" : "참석"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{status}</p>
        </div>
        {(!member.review || member.review.canEdit) && (
          <Button type="button" size="sm" variant="outline" onClick={toggleEditor}>
            {editing ? "닫기" : member.review ? "수정" : "리뷰 작성"}
          </Button>
        )}
      </div>
      {editing && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">별점</span>
            {[1, 2, 3, 4, 5].map((value) => (
              <Button key={value} type="button" size="sm" variant={score === value ? "default" : "outline"} onClick={() => setScore(value)}>{value}</Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Button key={tag.id} type="button" size="sm" variant={selected.includes(tag.id) ? "default" : "outline"} onClick={() => toggle(tag.id)}>
                {tag.polarity === "CAUTION" ? "주의 · " : ""}{tag.label}
              </Button>
            ))}
          </div>
          <Textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={500} placeholder="업체 전용 메모 (선택, 최대 500자)" />
          <Button type="button" disabled={saving || !canSubmit} onClick={() => void save()}>{saving ? "저장 중…" : "비공개 리뷰 저장"}</Button>
        </div>
      )}
    </div>
  );
}
