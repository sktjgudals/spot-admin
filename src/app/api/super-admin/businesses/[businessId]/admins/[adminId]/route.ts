/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string; adminId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId, adminId } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json({ message: "isActive(boolean) 필수" }, { status: 400 });
  }

  const admin = await prisma.adminAccount.findFirst({
    where: { id: adminId, businessId, role: "BUSINESS" },
  });
  if (!admin) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: { isActive: body.isActive },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(updated);
}
