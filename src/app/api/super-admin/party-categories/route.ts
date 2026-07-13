import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/** 파티 카테고리 전체 목록 (관리용, 비활성 포함) */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const categories = await prisma.partyCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { parties: true } } },
  });

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      partyCount: c._count.parties,
    })),
  );
}

/** 카테고리 생성 — name 필수, status(FIXED/NORMAL)·sortOrder 선택 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ message: "카테고리 이름을 입력하세요" }, { status: 400 });
  }

  const exists = await prisma.partyCategory.findUnique({ where: { name } });
  if (exists) {
    return NextResponse.json({ message: "이미 있는 카테고리입니다" }, { status: 409 });
  }

  const category = await prisma.partyCategory.create({
    data: {
      name,
      status: body.status === "FIXED" ? "FIXED" : "NORMAL",
      sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
      iconUrl: body.iconUrl || null,
    },
  });
  return NextResponse.json(category, { status: 201 });
}
