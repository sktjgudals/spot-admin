"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TargetType = "ALL" | "USERS" | "PARTY_PARTICIPANTS" | "PARTY_WISHLISTERS";
type Category = "MARKETING" | "SYSTEM";

interface PartyOption {
  id: string;
  title: string;
  date: string;
  currentCount: number;
  maxCapacity: number;
  wishlistCount: number;
}

interface SelectedUser {
  id: string;
  nickname: string;
  email: string;
}

interface Props {
  userCount: number;
  parties: PartyOption[];
}

const TARGET_LABELS: Record<TargetType, string> = {
  ALL: "전체 유저",
  USERS: "특정 유저",
  PARTY_PARTICIPANTS: "파티 참가자",
  PARTY_WISHLISTERS: "파티 위시리스트 유저",
};

export default function NotificationForm({ userCount, parties }: Props) {
  const [targetType, setTargetType] = useState<TargetType>("ALL");
  const [partyId, setPartyId] = useState<string>("");
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SelectedUser[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [clickAction, setClickAction] = useState("");
  const [category, setCategory] = useState<Category>("MARKETING");
  const [sending, setSending] = useState(false);

  const needsParty =
    targetType === "PARTY_PARTICIPANTS" || targetType === "PARTY_WISHLISTERS";

  async function searchUsers() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/super-admin/users/search?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      setResults(data.users ?? []);
      if ((data.users ?? []).length === 0) toast.info("검색 결과가 없습니다.");
    } catch {
      toast.error("유저 검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  }

  function addUser(user: SelectedUser) {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id) ? prev : [...prev, user]
    );
    setResults((prev) => prev.filter((u) => u.id !== user.id));
  }

  function removeUser(id: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id));
  }

  const valid =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (targetType !== "USERS" || selectedUsers.length > 0) &&
    (!needsParty || partyId.length > 0);

  async function handleSend() {
    if (!valid || sending) return;

    const targetSummary =
      targetType === "ALL"
        ? `전체 유저 ${userCount.toLocaleString()}명`
        : targetType === "USERS"
          ? `선택 유저 ${selectedUsers.length}명`
          : `${TARGET_LABELS[targetType]} (${parties.find((p) => p.id === partyId)?.title ?? ""})`;

    if (!window.confirm(`${targetSummary}에게 알림을 발송할까요?`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/super-admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          ...(targetType === "USERS"
            ? { userIds: selectedUsers.map((u) => u.id) }
            : {}),
          ...(needsParty ? { partyId } : {}),
          title,
          body,
          ...(clickAction.trim() ? { clickAction: clickAction.trim() } : {}),
          category,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "발송에 실패했습니다.");
        return;
      }
      toast.success(
        `발송 완료 — 대상 ${Number(data.targetCount).toLocaleString()}명 (${data.batches}개 배치 큐 적재)`
      );
      setTitle("");
      setBody("");
      setClickAction("");
      setSelectedUsers([]);
    } catch {
      toast.error("발송 요청 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 타겟 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. 타겟 지정</CardTitle>
          <CardDescription>알림을 받을 대상을 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>대상</Label>
            <Select
              value={targetType}
              onValueChange={(v) => setTargetType(v as TargetType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  전체 유저 ({userCount.toLocaleString()}명)
                </SelectItem>
                <SelectItem value="USERS">특정 유저 선택</SelectItem>
                <SelectItem value="PARTY_PARTICIPANTS">파티 참가자</SelectItem>
                <SelectItem value="PARTY_WISHLISTERS">
                  파티 위시리스트 유저
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetType === "USERS" && (
            <div className="space-y-3">
              <Label>유저 검색</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="닉네임 또는 이메일"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={searchUsers}
                  disabled={searching}
                >
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {results.length > 0 && (
                <div className="rounded-md border divide-y">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => addUser(u)}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <span className="font-medium">{u.nickname}</span>
                      <span className="text-muted-foreground text-xs">
                        {u.email}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((u) => (
                    <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
                      {u.nickname}
                      <button
                        type="button"
                        onClick={() => removeUser(u.id)}
                        className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {needsParty && (
            <div className="space-y-2">
              <Label>파티 선택</Label>
              <Select value={partyId} onValueChange={(v) => setPartyId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="파티를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title} · {new Date(p.date).toLocaleDateString("ko-KR")}{" "}
                      ({targetType === "PARTY_WISHLISTERS"
                        ? `위시 ${p.wishlistCount}명`
                        : `참가 ${p.currentCount}/${p.maxCapacity}명`})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>알림 분류</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">
                  마케팅 (옵트인 유저만 · 야간 제한 · 일일 한도)
                </SelectItem>
                <SelectItem value="SYSTEM">공지/안내 (시스템 알림)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 내용 작성 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. 내용 작성</CardTitle>
          <CardDescription>푸시에 표시될 제목과 본문입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="push-title">제목</Label>
            <Input
              id="push-title"
              placeholder="예) 이번 주말 파티를 놓치지 마세요 🎉"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">
              {title.length}/100
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="push-body">본문</Label>
            <Textarea
              id="push-body"
              placeholder="알림 본문을 입력하세요"
              rows={4}
              maxLength={500}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">
              {body.length}/500
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="push-link">이동 경로 (선택)</Label>
            <Input
              id="push-link"
              placeholder="/parties/abc123"
              value={clickAction}
              onChange={(e) => setClickAction(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              알림 탭 시 앱에서 이동할 딥링크 경로입니다.
            </p>
          </div>

          {/* 미리보기 */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground mb-1.5">미리보기</p>
            <div className="rounded-md bg-background border shadow-sm p-3">
              <p className="text-sm font-semibold truncate">
                {title || "알림 제목"}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {body || "알림 본문이 여기에 표시됩니다."}
              </p>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!valid || sending}
            onClick={handleSend}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {sending ? "발송 중..." : "알림 발송"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
