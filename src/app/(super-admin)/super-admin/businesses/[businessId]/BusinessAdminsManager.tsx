"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type BusinessAdminRow = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string | Date;
};

export default function BusinessAdminsManager({
  businessId,
  initialAdmins,
}: {
  businessId: string;
  initialAdmins: BusinessAdminRow[];
}) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        `/api/super-admin/businesses/${businessId}/admins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "생성 실패");
      setAdmins((prev) => [...prev, data]);
      setEmail("");
      setName("");
      setPassword("");
      toast.success("웹 어드민 계정이 생성되었습니다 (앱 로그인 불가)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(admin: BusinessAdminRow) {
    setTogglingId(admin.id);
    try {
      const res = await fetch(
        `/api/super-admin/businesses/${businessId}/admins/${admin.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !admin.isActive }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "변경 실패");
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, ...data } : a)),
      );
      toast.success(data.isActive ? "활성화됨" : "비활성화됨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">웹 어드민 (1:N)</CardTitle>
        <p className="text-xs text-muted-foreground">
          이메일/비밀번호로 spot-admin에만 로그인합니다. 앱 OAuth와 무관합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {admins.length === 0 && (
            <li className="text-muted-foreground">등록된 어드민이 없습니다.</li>
          )}
          {admins.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{a.name}</p>
                <p className="text-xs text-muted-foreground truncate">{a.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.isActive ? "default" : "outline"} className="text-xs">
                  {a.isActive ? "활성" : "비활성"}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={togglingId === a.id}
                  onClick={() => toggleActive(a)}
                >
                  {a.isActive ? "비활성" : "활성"}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={onCreate} className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">어드민 강제 생성</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">이메일</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ops@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-name">이름</Label>
              <Input
                id="admin-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="운영 담당자"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">임시 비밀번호 (8자+)</Label>
            <Input
              id="admin-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                생성 중…
              </>
            ) : (
              "계정 생성"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
