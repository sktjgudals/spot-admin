import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const CATEGORIES = ["CONVERSATION", "MOOD", "MANNER"] as const;
type Category = (typeof CATEGORIES)[number];

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

/** 칭찬 태그 생성 — label 필수, category 필수(CONVERSATION/MOOD/MANNER), sortOrder 선택 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ message: "태그 문구를 입력하세요" }, { status: 400 });
  }
  if (!isCategory(body?.category)) {
    return NextResponse.json({ message: "카테고리를 선택하세요" }, { status: 400 });
  }

  const tag = await prisma.praiseTag.create({
    data: {
      label,
      category: body.category,
      sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    },
  });
  return NextResponse.json(tag, { status: 201 });
}
