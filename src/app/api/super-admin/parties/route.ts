import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ensureTechnicalPartyHost } from "@/lib/business-hosts";

export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (
    !body?.title ||
    !body?.description ||
    !body?.date ||
    !body?.location ||
    !body?.businessId
  ) {
    return NextResponse.json(
      {
        message:
          "필수 항목 누락 (title, description, date, location, businessId)",
      },
      { status: 400 },
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: body.businessId },
    select: { id: true, name: true },
  });
  if (!business) {
    return NextResponse.json({ message: "업체를 찾을 수 없습니다" }, { status: 404 });
  }

  const adminId = await ensureTechnicalPartyHost(business.id, business.name);

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
      adminId,
      businessId: business.id,
    },
  });

  return NextResponse.json(party, { status: 201 });
}
