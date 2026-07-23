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

/** 런타임 설정 목록 */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const settings = await prisma.appSetting.findMany({
    orderBy: { key: "asc" },
  });
  return NextResponse.json(settings);
}

/** 설정 값 수정(upsert). body: { key, value, description? } */
export async function PATCH(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const key: string = (body?.key ?? "").trim();
  const value: string = String(body?.value ?? "").trim();
  if (!key) {
    return NextResponse.json({ message: "key가 필요합니다" }, { status: 400 });
  }

  const updated = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, description: body?.description ?? null },
    update: {
      value,
      ...(body?.description !== undefined && { description: body.description }),
    },
  });
  return NextResponse.json(updated);
}
