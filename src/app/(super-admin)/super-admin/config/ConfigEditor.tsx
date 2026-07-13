"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";

interface Setting {
  key: string;
  value: string;
  description: string | null;
}

export default function ConfigEditor({ initial }: { initial: Setting[] }) {
  const queryClient = useQueryClient();
  const { data: serverRows = [] } = useQuery({
    queryKey: queryKeys.config,
    queryFn: () => fetchJson<Setting[]>("/api/super-admin/config"),
    initialData: initial,
  });
  const [rows, setRows] = useState<Setting[]>(serverRows);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [syncedFrom, setSyncedFrom] = useState(serverRows);

  if (serverRows !== syncedFrom) {
    setSyncedFrom(serverRows);
    setRows(serverRows);
  }

  const setValue = (key: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));

  const save = async (row: Setting) => {
    setSavingKey(row.key);
    try {
      await fetchJson("/api/super-admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.key, value: row.value }),
      });
      toast.success(`${row.key} 저장됨`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.config });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
    } finally {
      setSavingKey(null);
    }
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          등록된 설정이 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.key}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-mono">{row.key}</CardTitle>
            {row.description && (
              <p className="text-xs text-muted-foreground">{row.description}</p>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="sr-only">값</Label>
                <Input
                  value={row.value}
                  onChange={(e) => setValue(row.key, e.target.value)}
                />
              </div>
              <Button
                onClick={() => save(row)}
                disabled={savingKey === row.key}
              >
                {savingKey === row.key ? "저장 중..." : "저장"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
