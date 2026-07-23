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


  let categoryId: string | null = body.categoryId || null;
  if (categoryId) {
    const category = await prisma.partyCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ message: "카테고리를 찾을 수 없습니다" }, { status: 404 });
    }
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
      categoryId,
      admissionMode: body.admissionMode ?? "APPROVAL",
      coverImage: body.coverImage || null,
      images: Array.isArray(body.images)
        ? body.images.filter(
            (u: unknown): u is string => typeof u === "string" && u.length > 0,
          )
        : [],
      businessId: business.id,
    },
  });

  return NextResponse.json(party, { status: 201 });
}
