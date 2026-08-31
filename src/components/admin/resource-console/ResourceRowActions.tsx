import { AlertTriangle, Check, Eye, Pencil, Trash2 } from "lucide-react";
import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { Action, ResourceConfig } from "@/components/admin/resource-configs";
import { Button } from "@/components/ui/button";

export type ResourceRowActionHandlers = {
  onDetail: (row: AdminResource) => void;
  onEdit: (row: AdminResource) => void;
  onAction: (action: Action, row: AdminResource) => void;
};

type ResourceRowActionsProps = ResourceRowActionHandlers & {
  config: ResourceConfig;
  row: AdminResource;
  disabled: boolean;
};

export function ResourceRowActions({
  config,
  row,
  disabled,
  onDetail,
  onEdit,
  onAction,
}: ResourceRowActionsProps) {
  const actions = config.actions?.filter((action) => !action.hidden?.(row)) ?? [];

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button size="xs" variant="ghost" onClick={() => onDetail(row)}>
        <Eye /> 상세
      </Button>
      {config.edit ? (
        <Button size="xs" variant="ghost" disabled={disabled} onClick={() => onEdit(row)}>
          <Pencil /> 수정
        </Button>
      ) : null}
      {actions.map((action) => {
        const ActionIcon = action.destructive && /삭제|비활성화|숨김/.test(action.label)
          ? Trash2
          : action.destructive
            ? AlertTriangle
            : Check;
        return (
          <Button
            key={action.label}
            size="xs"
            variant={action.destructive ? "destructive" : "outline"}
            disabled={disabled}
            onClick={() => onAction(action, row)}
          >
            <ActionIcon />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
