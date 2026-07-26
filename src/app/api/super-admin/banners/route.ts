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
import {
  normalizeBannerActionType,
  resolveBannerActionFields,
} from "@/lib/banner-actions";

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
    return NextResponse.json(
      { message: "제목과 이미지가 필요합니다" },
      { status: 400 },
    );
  }

  if (
    body.actionType != null &&
    body.actionType !== "" &&
    normalizeBannerActionType(body.actionType) == null
  ) {
    return NextResponse.json(
      { message: "지원하지 않는 actionType 입니다" },
      { status: 400 },
    );
  }

  const fields = resolveBannerActionFields({
    actionType: body.actionType,
    actionValue: body.actionValue,
    linkUrl: body.linkUrl,
  });

  if (
    fields.actionType &&
    fields.actionType !== "NONE" &&
    !fields.actionValue
  ) {
    return NextResponse.json(
      { message: "actionValue가 필요합니다" },
      { status: 400 },
    );
  }

  const banner = await prisma.banner.create({
    data: {
      title: body.title,
      imageUrl: body.imageUrl,
      linkUrl: fields.linkUrl,
      actionType: fields.actionType,
      actionValue: fields.actionValue,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return NextResponse.json(banner, { status: 201 });
}
