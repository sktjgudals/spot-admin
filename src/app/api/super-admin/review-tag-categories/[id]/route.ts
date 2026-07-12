import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/** 칭찬 태그 카테고리 수정 — name(앱 섹션 제목)·sortOrder 부분 갱신 */
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
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;

  try {
    const updated = await prisma.praiseTagCategory.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { message: "카테고리를 찾을 수 없거나 이름이 중복됩니다" },
      { status: 400 }
    );
  }
}

/** 칭찬 태그 카테고리 삭제 — 태그가 남아있으면 삭제 불가(FK Restrict) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const tagCount = await prisma.praiseTag.count({ where: { categoryId: id } });
  if (tagCount > 0) {
    return NextResponse.json(
      { message: `태그 ${tagCount}개가 남아있습니다. 태그를 먼저 삭제하거나 이동하세요` },
      { status: 409 }
    );
  }

  try {
    await prisma.praiseTagCategory.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ message: "카테고리를 찾을 수 없습니다" }, { status: 404 });
  }
}
