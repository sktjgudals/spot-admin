import { Badge } from "@/components/ui/badge";
import type { BusinessStatus } from "@/auth/api/admin-business.api";

const map: Record<
  BusinessStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ACTIVE: { label: "ACTIVE", variant: "default" },
  PENDING: { label: "PENDING", variant: "secondary" },
  SUSPENDED: { label: "SUSPENDED", variant: "outline" },
  DISABLED: { label: "DISABLED", variant: "destructive" },
};

export function BusinessStatusBadge({
  status,
  deletedAt,
}: {
  status: BusinessStatus;
  deletedAt?: string | null;
}) {
  const meta = map[status] ?? { label: status, variant: "outline" as const };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={meta.variant}>{meta.label}</Badge>
      {deletedAt && (
        <Badge variant="outline" className="text-xs">
          soft-deleted
        </Badge>
      )}
    </div>
  );
}
