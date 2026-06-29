import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ partyId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { partyId } = await params;
  const body = await req.json().catch(() => ({}));

  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  await prisma.party.update({
    where: { id: partyId },
    data: { businessId: body.businessId ?? null },
  });

  return NextResponse.json({ success: true });
}
