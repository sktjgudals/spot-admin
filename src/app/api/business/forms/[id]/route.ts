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
import type { FormFieldType } from "@/generated/prisma";

interface Params {
  params: Promise<{ id: string }>;
}

async function loadOwnedField(id: string, businessId: string | null | undefined) {
  const field = await prisma.businessFormField.findUnique({ where: { id } });
  if (!field) {
    return { field: null, error: NextResponse.json({ message: "NOT_FOUND" }, { status: 404 }) };
  }
  if (field.businessId !== businessId) {
    return { field: null, error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { field, error: null as NextResponse | null };
}

/** 질문 수정 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const { id } = await params;
  const owned = await loadOwnedField(id, session.user.businessId);
  if (owned.error) return owned.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (body.type) data.type = body.type as FormFieldType;
  if (typeof body.required === "boolean") data.required = body.required;
  if (typeof body.order === "number") data.order = body.order;

  const type = (data.type as FormFieldType) ?? owned.field!.type;
  if (Array.isArray(body.options)) {
    data.options = body.options.map((o: unknown) => String(o).trim()).filter(Boolean);
  }
  if (
    (type === "SELECT" || type === "MULTISELECT") &&
    Array.isArray(data.options) &&
    (data.options as string[]).length === 0
  ) {
    return NextResponse.json(
      { message: "선택형 질문은 선택지를 1개 이상 입력하세요" },
      { status: 400 }
    );
  }

  const updated = await prisma.businessFormField.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/**
 * 질문 삭제 — 기존 답변 스냅샷 보존을 위해 물리 삭제 대신 archived 처리하고,
 * 파티 선택(PartyFormField)에서만 제거한다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const { id } = await params;
  const owned = await loadOwnedField(id, session.user.businessId);
  if (owned.error) return owned.error;

  await prisma.$transaction([
    prisma.businessFormField.update({ where: { id }, data: { archived: true } }),
    prisma.partyFormField.deleteMany({ where: { fieldId: id } }),
  ]);
  return NextResponse.json({ success: true });
}
