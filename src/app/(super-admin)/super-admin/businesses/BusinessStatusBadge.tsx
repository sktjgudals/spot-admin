import { Badge } from "@/components/ui/badge";
import { BusinessStatus } from "@/generated/prisma";

export default function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  if (status === "ACTIVE")
    return <Badge className="text-xs bg-green-100 text-green-700 border-0">활성</Badge>;
  if (status === "PENDING")
    return <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">승인 대기</Badge>;
  return <Badge variant="destructive" className="text-xs">정지</Badge>;
}
