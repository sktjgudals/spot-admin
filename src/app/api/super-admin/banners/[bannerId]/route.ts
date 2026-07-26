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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> },
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { bannerId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
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

  const actionTouched =
    body.actionType !== undefined ||
    body.actionValue !== undefined ||
    body.linkUrl !== undefined;

  const fields = actionTouched
    ? resolveBannerActionFields({
        actionType: body.actionType,
        actionValue: body.actionValue,
        linkUrl: body.linkUrl,
      })
    : null;

  const banner = await prisma.banner.update({
    where: { id: bannerId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(fields
        ? {
            linkUrl: fields.linkUrl,
            actionType: fields.actionType,
            actionValue: fields.actionValue,
          }
        : {}),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    },
  });
  return NextResponse.json(banner);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> },
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { bannerId } = await params;
  await prisma.banner.delete({ where: { id: bannerId } });
  return NextResponse.json({ ok: true });
}
