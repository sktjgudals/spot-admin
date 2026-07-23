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

const FIELD_TYPES: FormFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "SELECT",
  "MULTISELECT",
];

/** 업체 재사용 폼 질문 목록 (아카이브 제외) */
export async function GET() {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const fields = await prisma.businessFormField.findMany({
    where: { businessId: session.user.businessId!, archived: false },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(fields);
}

/** 질문 생성 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 정보가 없습니다" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const label: string = (body?.label ?? "").trim();
  const type: FormFieldType = body?.type ?? "TEXT";
  if (!label) {
    return NextResponse.json({ message: "질문을 입력하세요" }, { status: 400 });
  }
  if (!FIELD_TYPES.includes(type)) {
    return NextResponse.json({ message: "유형이 올바르지 않습니다" }, { status: 400 });
  }

  const options: string[] =
    (type === "SELECT" || type === "MULTISELECT") && Array.isArray(body.options)
      ? body.options.map((o: unknown) => String(o).trim()).filter(Boolean)
      : [];
  if ((type === "SELECT" || type === "MULTISELECT") && options.length === 0) {
    return NextResponse.json(
      { message: "선택형 질문은 선택지를 1개 이상 입력하세요" },
      { status: 400 }
    );
  }

  // order = 현재 최대 + 1
  const last = await prisma.businessFormField.findFirst({
    where: { businessId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const field = await prisma.businessFormField.create({
    data: {
      businessId,
      label,
      type,
      options,
      required: Boolean(body.required),
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(field, { status: 201 });
}
