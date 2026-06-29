import { prisma } from "@/lib/prisma";
import SuperAdminPartyForm from "./SuperAdminPartyForm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function NewPartyPage() {
  const [businesses, hostCandidates] = await Promise.all([
    prisma.business.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, contactEmail: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      orderBy: { nickname: "asc" },
      take: 100,
      select: { id: true, nickname: true, email: true },
    }),
  ]);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href="/super-admin/parties" />}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold">파티 등록</h1>
      </div>
      <SuperAdminPartyForm businesses={businesses} hostCandidates={hostCandidates} />
    </div>
  );
}
