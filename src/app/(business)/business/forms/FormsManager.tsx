"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Plus,
  Copy,
  GripVertical,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";

type FieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "SELECT" | "MULTISELECT";

export interface FormFieldItem {
  id: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  order?: number;
}

const TYPE_LABEL: Record<FieldType, string> = {
  TEXT: "단답형",
  TEXTAREA: "장문형",
  NUMBER: "숫자",
  SELECT: "객관식",
  MULTISELECT: "복수 선택",
};

const isChoice = (t: FieldType) => t === "SELECT" || t === "MULTISELECT";

export default function FormsManager({
  initialFields,
}: {
  initialFields: FormFieldItem[];
}) {
  const queryClient = useQueryClient();
  const { data: serverFields = [] } = useQuery({
    queryKey: queryKeys.businessForms,
    queryFn: () => fetchJson<FormFieldItem[]>("/api/business/forms"),
    initialData: initialFields,
  });
  const [fields, setFields] = useState<FormFieldItem[]>(serverFields);
  const [activeId, setActiveId] = useState<string | null>(
    initialFields[0]?.id ?? null
  );
  const [adding, setAdding] = useState(false);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.businessForms });
  }, [queryClient]);

  const [syncedFrom, setSyncedFrom] = useState(serverFields);
  if (serverFields !== syncedFrom) {
    setSyncedFrom(serverFields);
    setFields(serverFields);
    if (
      activeId &&
      !serverFields.some((f) => f.id === activeId) &&
      serverFields.length > 0
    ) {
      setActiveId(serverFields[0].id);
    }
  }

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const patchField = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/business/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message ?? "저장에 실패했습니다");
        await invalidate();
        return false;
      }
      return true;
    },
    [invalidate]
  );

  const schedulePatch = useCallback(
    (id: string, body: Record<string, unknown>) => {
      const prev = saveTimers.current.get(id);
      if (prev) clearTimeout(prev);
      saveTimers.current.set(
        id,
        setTimeout(() => {
          void patchField(id, body);
          saveTimers.current.delete(id);
        }, 450)
      );
    },
    [patchField]
  );

  const updateLocal = useCallback(
    (id: string, patch: Partial<FormFieldItem>, persist = true) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      );
      if (!persist) return;
      const body: Record<string, unknown> = {};
      if (patch.label !== undefined) body.label = patch.label;
      if (patch.type !== undefined) body.type = patch.type;
      if (patch.required !== undefined) body.required = patch.required;
      if (patch.options !== undefined) body.options = patch.options;
      if (patch.order !== undefined) body.order = patch.order;
      if (Object.keys(body).length === 0) return;
      schedulePatch(id, body);
    },
    [schedulePatch]
  );

  const addField = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/business/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "제목 없는 질문",
          type: "TEXT",
          required: false,
          options: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message ?? "추가에 실패했습니다");
        return;
      }
      const created = await res.json();
      const item: FormFieldItem = {
        id: created.id,
        label: created.label,
        type: created.type,
        options: created.options ?? [],
        required: created.required,
        order: created.order,
      };
      setFields((prev) => [...prev, item]);
      setActiveId(item.id);
      toast.success("질문이 추가되었습니다");
      await invalidate();
    } finally {
      setAdding(false);
    }
  };

  const duplicateField = async (field: FormFieldItem) => {
    const res = await fetch("/api/business/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: `${field.label} (복사)`,
        type: field.type,
        required: field.required,
        options: isChoice(field.type) ? field.options : [],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "복제에 실패했습니다");
      return;
    }
    const created = await res.json();
    const item: FormFieldItem = {
      id: created.id,
      label: created.label,
      type: created.type,
      options: created.options ?? [],
      required: created.required,
      order: created.order,
    };
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === field.id);
      if (idx < 0) return [...prev, item];
      const next = [...prev];
      next.splice(idx + 1, 0, item);
      return next;
    });
    setActiveId(item.id);
    toast.success("질문을 복제했습니다");
    await invalidate();
  };

  const deleteField = async (id: string) => {
    if (!confirm("이 질문을 삭제할까요? 기존 신청 답변은 보존됩니다.")) return;
    const res = await fetch(`/api/business/forms/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("삭제에 실패했습니다");
      return;
    }
    setFields((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
    toast.success("삭제되었습니다");
    await invalidate();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = fields;
    const reordered = arrayMove(prev, oldIndex, newIndex).map((f, i) => ({
      ...f,
      order: i,
    }));
    setFields(reordered);

    const changed = reordered.filter((f, i) => prev[i]?.id !== f.id);
    await Promise.all(changed.map((f) => patchField(f.id, { order: f.order })));
    await invalidate();
  };

  return (
    <div className="rounded-xl bg-[#f0ebf8]/70 dark:bg-muted/40 px-3 py-6 sm:px-6 min-h-[420px]">
      <div className="mx-auto flex max-w-2xl gap-3 items-start">
        <div className="min-w-0 flex-1 space-y-3">
          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-background px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                아직 등록한 질문이 없습니다.
                <br />
                오른쪽 + 버튼으로 질문을 추가하세요.
              </p>
              <Button onClick={addField} disabled={adding}>
                <Plus className="w-4 h-4 mr-1" />
                첫 질문 추가
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {fields.map((field) => (
                  <SortableQuestionCard
                    key={field.id}
                    field={field}
                    active={activeId === field.id}
                    onActivate={() => setActiveId(field.id)}
                    onChange={(patch, persist) =>
                      updateLocal(field.id, patch, persist)
                    }
                    onDuplicate={() => duplicateField(field)}
                    onDelete={() => deleteField(field.id)}
                    onFlushPatch={(body) => {
                      const t = saveTimers.current.get(field.id);
                      if (t) clearTimeout(t);
                      void patchField(field.id, body);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="sticky top-24 shrink-0 pt-1">
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shadow-lg"
            onClick={addField}
            disabled={adding}
            title="질문 추가"
            aria-label="질문 추가"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableQuestionCard({
  field,
  active,
  onActivate,
  onChange,
  onDuplicate,
  onDelete,
  onFlushPatch,
}: {
  field: FormFieldItem;
  active: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<FormFieldItem>, persist?: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFlushPatch: (body: Record<string, unknown>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border bg-background shadow-sm transition-shadow",
        active && "ring-1 ring-primary/30 shadow-md",
        isDragging && "opacity-80 z-20 shadow-lg"
      )}
      onClick={onActivate}
    >
      {/* 활성 좌측 강조선 */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 rounded-l-lg transition-colors",
          active ? "bg-primary" : "bg-transparent"
        )}
      />

      <div className="flex items-start gap-1 pl-3 pr-2 pt-2">
        <button
          type="button"
          className="mt-2 cursor-grab touch-none p-1 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="순서 변경"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 py-2 pr-2 space-y-3">
          {active ? (
            <ActiveEditor
              field={field}
              onChange={onChange}
              onFlushPatch={onFlushPatch}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ) : (
            <IdlePreview field={field} />
          )}
        </div>
      </div>
    </div>
  );
}

function IdlePreview({ field }: { field: FormFieldItem }) {
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm">
          {field.label || "제목 없는 질문"}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </span>
        <Badge variant="secondary" className="text-xs font-normal">
          {TYPE_LABEL[field.type]}
        </Badge>
      </div>
      {isChoice(field.type) && field.options.length > 0 && (
        <ul className="space-y-1.5 pl-0.5">
          {field.options.map((opt, i) => (
            <li
              key={`${opt}-${i}`}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 shrink-0 border border-muted-foreground/40",
                  field.type === "SELECT" ? "rounded-full" : "rounded-[3px]"
                )}
              />
              {opt}
            </li>
          ))}
        </ul>
      )}
      {!isChoice(field.type) && (
        <div className="h-8 rounded border border-dashed border-muted-foreground/25 bg-muted/20" />
      )}
    </div>
  );
}

function ActiveEditor({
  field,
  onChange,
  onFlushPatch,
  onDuplicate,
  onDelete,
}: {
  field: FormFieldItem;
  onChange: (patch: Partial<FormFieldItem>, persist?: boolean) => void;
  onFlushPatch: (body: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState(
    field.options.length > 0 ? field.options : [""]
  );

  useEffect(() => {
    setLabel(field.label);
    setOptions(field.options.length > 0 ? field.options : [""]);
  }, [field.id, field.label, field.options]);

  const commitLabel = () => {
    const next = label.trim() || "제목 없는 질문";
    if (next !== field.label) {
      onChange({ label: next });
      onFlushPatch({ label: next });
    }
  };

  const commitOptions = (next: string[]) => {
    const cleaned = next.map((o) => o.trim()).filter(Boolean);
    onChange({ options: cleaned }, false);
    if (cleaned.length > 0) {
      onFlushPatch({ options: cleaned });
    }
  };

  const handleTypeChange = (type: FieldType) => {
    if (type === field.type) return;
    if (isChoice(type) && !isChoice(field.type)) {
      const opts = options.map((o) => o.trim()).filter(Boolean);
      const nextOpts = opts.length > 0 ? opts : ["옵션 1"];
      setOptions(nextOpts);
      onChange({ type, options: nextOpts });
      onFlushPatch({ type, options: nextOpts });
    } else if (!isChoice(type)) {
      onChange({ type, options: [] });
      onFlushPatch({ type, options: [] });
    } else {
      onChange({ type });
      onFlushPatch({ type });
    }
  };

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          className="flex-1 text-base font-medium border-0 border-b rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            onChange({ label: e.target.value }, false);
          }}
          onBlur={commitLabel}
          placeholder="질문"
        />
        <Select
          value={field.type}
          onValueChange={(v) => v && handleTypeChange(v as FieldType)}
        >
          <SelectTrigger className="w-full sm:w-[140px] shrink-0">
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

      {isChoice(field.type) ? (
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 shrink-0 border border-muted-foreground/40",
                  field.type === "SELECT" ? "rounded-full" : "rounded-[3px]"
                )}
              />
              <Input
                className="h-8 border-0 border-b rounded-none px-0 shadow-none focus-visible:ring-0"
                value={opt}
                placeholder={`옵션 ${i + 1}`}
                onChange={(e) => {
                  const next = [...options];
                  next[i] = e.target.value;
                  setOptions(next);
                  onChange(
                    { options: next.map((o) => o.trim()).filter(Boolean) },
                    false
                  );
                }}
                onBlur={() => commitOptions(options)}
              />
              {options.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const next = options.filter((_, j) => j !== i);
                    setOptions(next.length ? next : [""]);
                    commitOptions(next);
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground pl-5"
            onClick={() => {
              const next = [...options, ""];
              setOptions(next);
            }}
          >
            옵션 추가
          </button>
        </div>
      ) : (
        <div className="h-9 rounded border border-dashed border-muted-foreground/25 bg-muted/15 px-3 flex items-center text-sm text-muted-foreground">
          {field.type === "TEXTAREA"
            ? "장문 답변"
            : field.type === "NUMBER"
              ? "숫자 답변"
              : "단답형 텍스트"}
        </div>
      )}

      <div className="flex items-center justify-end gap-1 border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="복제"
          onClick={onDuplicate}
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="삭제"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <label className="flex items-center gap-2 text-sm px-1 cursor-pointer select-none">
          <span className="text-muted-foreground">필수</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={field.required}
            onChange={(e) => {
              onChange({ required: e.target.checked });
              onFlushPatch({ required: e.target.checked });
            }}
          />
        </label>
      </div>
    </div>
  );
}
