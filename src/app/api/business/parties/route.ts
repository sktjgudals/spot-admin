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

function parseImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && u.length > 0);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "업체 정보가 없습니다" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.description || !body?.date || !body?.location) {
    return NextResponse.json({ message: "필수 항목 누락" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
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

  const images = parseImages(body.images);

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
      images,
      isActive: body.isActive ?? true,
      businessId,
    },
  });

  const formFieldIds: string[] = Array.isArray(body.formFieldIds)
    ? body.formFieldIds
    : [];
  if (formFieldIds.length > 0) {
    const owned = await prisma.businessFormField.findMany({
      where: { id: { in: formFieldIds }, businessId },
      select: { id: true },
    });
    const validIds = new Set(owned.map((f) => f.id));
    await prisma.partyFormField.createMany({
      data: formFieldIds
        .filter((fid) => validIds.has(fid))
        .map((fid, idx) => ({ partyId: party.id, fieldId: fid, order: idx })),
    });
  }

  return NextResponse.json(party, { status: 201 });
}
