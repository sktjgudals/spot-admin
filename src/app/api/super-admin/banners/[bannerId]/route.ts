import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { bannerId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  }

  const banner = await prisma.banner.update({
    where: { id: bannerId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.linkUrl !== undefined && { linkUrl: body.linkUrl || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    },
  });
  return NextResponse.json(banner);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { bannerId } = await params;
  await prisma.banner.delete({ where: { id: bannerId } });
  return NextResponse.json({ ok: true });
}
