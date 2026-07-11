import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const CATEGORIES = ["CONVERSATION", "MOOD", "MANNER"] as const;

/** 칭찬 태그 수정 — label(문구)·category(타입)·sortOrder·isActive 부분 갱신 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) {
    data.label = body.label.trim();
  }
  if (
    typeof body.category === "string" &&
    (CATEGORIES as readonly string[]).includes(body.category)
  ) {
    data.category = body.category;
  }
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  try {
    const updated = await prisma.praiseTag.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "태그를 찾을 수 없습니다" }, { status: 404 });
  }
}

/** 칭찬 태그 삭제 — 기존 리뷰의 태그 참조(id)는 그대로 남지만 집계에서 제외됨 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  try {
    await prisma.praiseTag.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ message: "태그를 찾을 수 없습니다" }, { status: 404 });
  }
}
