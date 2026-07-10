"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

type FieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "SELECT" | "MULTISELECT";

export interface FormFieldItem {
  id: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
}

const TYPE_LABEL: Record<FieldType, string> = {
  TEXT: "단답",
  TEXTAREA: "장문",
  NUMBER: "숫자",
  SELECT: "단일 선택",
  MULTISELECT: "복수 선택",
};

const isChoice = (t: FieldType) => t === "SELECT" || t === "MULTISELECT";

export default function FormsManager({
  initialFields,
}: {
  initialFields: FormFieldItem[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<FormFieldItem[]>(initialFields);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("TEXT");
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setLabel("");
    setType("TEXT");
    setRequired(false);
    setOptionsText("");
  };

  const addField = async () => {
    if (!label.trim()) {
      toast.error("질문을 입력하세요");
      return;
    }
    const options = isChoice(type)
      ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
      : [];
    if (isChoice(type) && options.length === 0) {
      toast.error("선택지를 쉼표로 구분해 1개 이상 입력하세요");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/business/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), type, required, options }),
    });
    setSaving(false);

    if (res.ok) {
      const created: FormFieldItem = await res.json();
      setFields((prev) => [...prev, created]);
      resetForm();
      toast.success("질문이 추가되었습니다");
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "추가에 실패했습니다");
    }
  };

  const deleteField = async (id: string) => {
    if (!confirm("이 질문을 삭제할까요? 기존 신청 답변은 보존됩니다.")) return;
    const res = await fetch(`/api/business/forms/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== id));
      toast.success("삭제되었습니다");
      router.refresh();
    } else {
      toast.error("삭제에 실패했습니다");
    }
  };

  return (
    <div className="space-y-4">
      {/* 질문 추가 */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">질문 추가</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          <div className="space-y-1.5">
            <Label>질문 *</Label>
            <Input
              placeholder="예) 인스타그램 아이디"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>유형</Label>
              <Select
                value={type}
                onValueChange={(v) => v && setType(v as FieldType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>필수 여부</Label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
                필수 입력
              </label>
            </div>
          </div>

          {isChoice(type) && (
            <div className="space-y-1.5">
              <Label>선택지 (쉼표로 구분)</Label>
              <Input
                placeholder="예) 인스타, 지인 소개, 검색"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={addField} disabled={saving}>
              <Plus className="w-4 h-4 mr-1" />
              {saving ? "추가 중..." : "질문 추가"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 질문 목록 */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">질문 목록 ({fields.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 등록한 질문이 없습니다.
            </p>
          ) : (
            <ul className="divide-y">
              {fields.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{f.label}</span>
                      <Badge variant="secondary" className="text-xs">
                        {TYPE_LABEL[f.type]}
                      </Badge>
                      {f.required && (
                        <Badge variant="outline" className="text-xs text-destructive border-destructive/40">
                          필수
                        </Badge>
                      )}
                    </div>
                    {isChoice(f.type) && f.options.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {f.options.join(" · ")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => deleteField(f.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
