"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FoundUser {
  id: string;
  nickname: string;
  email: string;
}

/**
 * 알림 테스트 발송 — 유저 1명을 골라 고정 문구의 테스트 푸시를 보냅니다.
 * SYSTEM 분류로 발송되어 야간 제한/마케팅 옵트인 필터를 타지 않습니다.
 */
export default function TestSendCard() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FoundUser[]>([]);
  const [target, setTarget] = useState<FoundUser | null>(null);
  const [sending, setSending] = useState(false);

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

  async function handleTestSend() {
    if (!target || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/super-admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "USERS",
          userIds: [target.id],
          title: "[테스트] Dopa 알림 테스트",
          body: `어드민에서 보낸 테스트 알림입니다. (${new Date().toLocaleTimeString("ko-KR")})`,
          category: "SYSTEM",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "테스트 발송에 실패했습니다.");
        return;
      }
      toast.success(
        `${target.nickname}님에게 테스트 알림을 보냈습니다. 기기에서 수신을 확인하세요.`
      );
    } catch {
      toast.error("테스트 발송 요청 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="w-4 h-4" />
          알림 테스트
        </CardTitle>
        <CardDescription>
          유저 1명에게 테스트 푸시를 보내 수신 여부를 확인합니다. 시스템 분류로
          발송되어 야간 제한 없이 즉시 전달됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {target ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 pr-1 text-sm py-1">
              {target.nickname}
              <span className="text-muted-foreground font-normal">
                ({target.email})
              </span>
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          </div>
        ) : (
          <>
            <div className="flex gap-2 max-w-md">
              <Input
                placeholder="닉네임 또는 이메일로 검색"
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
              <div className="rounded-md border divide-y max-w-md">
                {results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setTarget(u);
                      setResults([]);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <span className="font-medium">{u.nickname}</span>
                    <span className="text-muted-foreground text-xs">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <Button
          onClick={handleTestSend}
          disabled={!target || sending}
          variant="outline"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FlaskConical className="w-4 h-4 mr-2" />
          )}
          테스트 알림 보내기
        </Button>
      </CardContent>
    </Card>
  );
}
