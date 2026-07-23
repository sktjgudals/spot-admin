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

export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const banners = await prisma.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(banners);
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.imageUrl) {
    return NextResponse.json({ message: "제목과 이미지가 필요합니다" }, { status: 400 });
  }

  const banner = await prisma.banner.create({
    data: {
      title: body.title,
      imageUrl: body.imageUrl,
      linkUrl: body.linkUrl || null,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return NextResponse.json(banner, { status: 201 });
}
