"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, UserMinus, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bffFetch } from "@/lib/fetch-json";

export type AppAdminRow = {
  id: string;
  email: string;
  nickname: string;
  role: string;
};

type SearchHit = {
  id: string;
  email: string;
  nickname: string;
};

export default function AppBusinessAdminsManager({
  businessId,
  businessName,
  initialAdmins,
}: {
  businessId: string;
  businessName: string;
  initialAdmins: AppAdminRow[];
}) {
  const router = useRouter();
  const [admins, setAdmins] = useState(initialAdmins);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const searchUsers = useCallback(async () => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await bffFetch(
        `/api/super-admin/users/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "검색 실패");
      const users: SearchHit[] = data.users ?? [];
      // 이미 이 업체 어드민인 유저는 결과에서 제외
      const adminIds = new Set(admins.map((a) => a.id));
      setHits(users.filter((u) => !adminIds.has(u.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "검색 실패");
    } finally {
      setSearching(false);
    }
  }, [query, admins]);

  async function promote(user: SearchHit) {
    setBusyId(user.id);
    try {
      const res = await bffFetch(`/api/super-admin/users/${user.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN", businessId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "지정 실패");
      setAdmins((prev) => [
        ...prev,
        {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          role: "ADMIN",
        },
      ]);
      setHits((prev) => prev.filter((h) => h.id !== user.id));
      toast.success(`${user.nickname}을(를) ${businessName} 앱 어드민으로 지정했습니다`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "지정 실패");
    } finally {
      setBusyId(null);
    }
  }

  async function demote(admin: AppAdminRow) {
    setBusyId(admin.id);
    try {
      const res = await bffFetch(`/api/super-admin/users/${admin.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "USER" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "강등 실패");
      setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
      toast.success(`${admin.nickname}을(를) 일반 유저로 변경했습니다`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "강등 실패");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">앱 업체 어드민 (OAuth 유저)</CardTitle>
        <p className="text-xs text-muted-foreground">
          앱에 구글/카카오 등으로 가입한 유저를 이 업체 운영자로 지정합니다.
          웹 어드민(이메일·비밀번호)과 다릅니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {admins.length === 0 && (
            <li className="text-muted-foreground">연결된 앱 어드민이 없습니다.</li>
          )}
          {admins.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{a.nickname}</p>
                <p className="text-xs text-muted-foreground truncate">{a.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  앱 어드민
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === a.id}
                  onClick={() => demote(a)}
                >
                  {busyId === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserMinus className="mr-1 h-3.5 w-3.5" />
                      강등
                    </>
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">앱 유저 검색 후 지정</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="app-admin-q">닉네임 또는 이메일</Label>
              <Input
                id="app-admin-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchUsers();
                  }
                }}
                placeholder="suhblue.00@gmail.com"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void searchUsers()}
              disabled={searching}
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="mr-1 h-4 w-4" />
                  검색
                </>
              )}
            </Button>
          </div>

          {hits.length > 0 && (
            <ul className="space-y-2 text-sm">
              {hits.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.nickname}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === u.id}
                    onClick={() => promote(u)}
                  >
                    {busyId === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        어드민 지정
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
