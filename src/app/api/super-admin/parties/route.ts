import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.description || !body?.date || !body?.location || !body?.adminId) {
    return NextResponse.json({ message: "필수 항목 누락" }, { status: 400 });
  }

  const host = await prisma.user.findUnique({ where: { id: body.adminId } });
  if (!host) {
    return NextResponse.json({ message: "호스트 유저를 찾을 수 없습니다" }, { status: 404 });
  }

  // 카테고리 선택 시 이름을 category(비정규화·구버전 앱 호환)에 함께 저장
  let categoryName: string | null = null;
  if (body.categoryId) {
    const category = await prisma.partyCategory.findUnique({
      where: { id: body.categoryId },
      select: { name: true },
    });
    if (!category) {
      return NextResponse.json({ message: "카테고리를 찾을 수 없습니다" }, { status: 404 });
    }
    categoryName = category.name;
  }

  const party = await prisma.party.create({
    data: {
      title: body.title,
      description: body.description,
      date: new Date(body.date),
      location: body.location,
      maxCapacity: body.maxCapacity,
      priceMale: body.priceMale ?? 0,
      priceFemale: body.priceFemale ?? 0,
      genderRatio: body.genderRatio || null,
      category: categoryName,
      categoryId: body.categoryId || null,
      admissionMode: body.admissionMode ?? "APPROVAL",
      coverImage: body.coverImage || null,
      images: Array.isArray(body.images)
        ? body.images.filter(
            (u: unknown): u is string => typeof u === "string" && u.length > 0,
          )
        : [],
      adminId: body.adminId,
      businessId: body.businessId || null,
    },
  });

  return NextResponse.json(party, { status: 201 });
}
