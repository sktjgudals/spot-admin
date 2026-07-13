"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NicknameEditor({
  userId,
  initialNickname,
}: {
  userId: string;
  initialNickname: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      toast.error("닉네임을 입력하세요");
      return;
    }
    if (trimmed === initialNickname) return;
    setSaving(true);
    const res = await fetch(`/api/super-admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: trimmed }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "저장에 실패했습니다");
      return;
    }
    toast.success("닉네임이 변경되었습니다");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6 pb-2">
        <CardTitle className="text-base">닉네임</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <form onSubmit={onSave} className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="nickname" className="sr-only">
              닉네임
            </Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
            />
          </div>
          <Button type="submit" size="sm" disabled={saving || nickname.trim() === initialNickname}>
            {saving ? "저장 중..." : "변경"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
