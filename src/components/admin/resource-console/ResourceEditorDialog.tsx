import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { Field, ResourceConfig } from "@/components/admin/resource-configs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ResourceEditorState = {
  mode: "create" | "edit";
  row?: AdminResource;
};

type ResourceEditorDialogProps = {
  config: ResourceConfig;
  editor: ResourceEditorState | null;
  fields?: readonly Field[];
  values: Record<string, unknown>;
  isPending: boolean;
  error: Error | null;
  onValueChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function ResourceEditorDialog({
  config,
  editor,
  fields,
  values,
  isPending,
  error,
  onValueChange,
  onSubmit,
  onClose,
}: ResourceEditorDialogProps) {
  return (
    <Dialog
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editor?.mode === "create" ? config.create?.label : `${config.title} 수정`}</DialogTitle>
          <DialogDescription>저장하면 운영 원본 데이터와 감사 로그에 반영됩니다.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-4 py-1">
            {fields?.map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label htmlFor={`${config.key}-${field.key}`}>
                  {field.label}{field.required ? <span aria-hidden="true"> *</span> : null}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={`${config.key}-${field.key}`}
                    required={field.required}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) => onValueChange(field.key, event.target.value)}
                  />
                ) : field.options ? (
                  <select
                    id={`${config.key}-${field.key}`}
                    className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
                    required={field.required}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) => onValueChange(field.key, event.target.value)}
                  >
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.type === "boolean" ? (
                  <label className="flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm">
                    <input
                      id={`${config.key}-${field.key}`}
                      type="checkbox"
                      checked={Boolean(values[field.key])}
                      onChange={(event) => onValueChange(field.key, event.target.checked)}
                    />
                    활성화
                  </label>
                ) : (
                  <Input
                    id={`${config.key}-${field.key}`}
                    type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                    required={field.required}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) => onValueChange(field.key, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
