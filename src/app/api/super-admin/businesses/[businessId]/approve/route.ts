import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  await prisma.business.update({
    where: { id: businessId },
    data: { status: "ACTIVE" },
  });

  return NextResponse.json({ success: true });
}
