import type { AdminResource } from "@/auth/api/admin-resources.api";
import type { ResourceConfig } from "@/components/admin/resource-configs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { renderResourceValue } from "./formatters";

export function ResourceDetailSheet({
  config,
  row,
  onOpenChange,
}: {
  config: ResourceConfig;
  row: AdminResource | null;
  onOpenChange: (open: boolean) => void;
}) {
  const details = row
    ? [
        ...(config.columns.some((column) => column.key === "id")
          ? []
          : [{ key: "id", label: "ID" }]),
        ...config.columns,
      ]
    : [];

  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
        <SheetHeader className="border-b px-5 py-4 pr-14">
          <SheetTitle>{config.title} 상세</SheetTitle>
          <SheetDescription>
            목록에서 생략된 값을 포함해 선택한 행의 전체 표시 필드를 확인합니다.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <dl className="divide-y">
            {row
              ? details.map((item) => {
                  const value = row[item.key];
                  const isStructured = typeof value === "object" && value !== null;
                  return (
                    <div
                      key={item.key}
                      className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
                    >
                      <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                      <dd className="min-w-0 break-words text-sm">
                        {isStructured ? (
                          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          renderResourceValue(value, item.key)
                        )}
                      </dd>
                    </div>
                  );
                })
              : null}
          </dl>
        </div>
        <SheetFooter className="border-t bg-muted/30 px-5 py-3">
          <SheetClose render={<Button variant="outline" />}>닫기</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
