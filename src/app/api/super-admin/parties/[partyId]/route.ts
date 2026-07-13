import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ partyId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { partyId } = await params;
  const party = await prisma.party.findUnique({
    where: { id: partyId },
    include: {
      business: { select: { id: true, name: true } },
      formFields: { select: { fieldId: true }, orderBy: { order: "asc" } },
      _count: { select: { applications: true } },
    },
  });
  if (!party) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    ...party,
    formFieldIds: party.formFields.map((f) => f.fieldId),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { partyId } = await params;
  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (body.date) data.date = new Date(body.date);
  if (typeof body.location === "string") data.location = body.location;
  if (typeof body.maxCapacity === "number") data.maxCapacity = body.maxCapacity;
  if (typeof body.priceMale === "number") data.priceMale = body.priceMale;
  if (typeof body.priceFemale === "number") data.priceFemale = body.priceFemale;
  if ("genderRatio" in body) data.genderRatio = body.genderRatio || null;
  if ("category" in body) data.category = body.category || null;
  if ("categoryId" in body) {
    if (body.categoryId) {
      const category = await prisma.partyCategory.findUnique({
        where: { id: body.categoryId },
        select: { name: true },
      });
      if (!category) {
        return NextResponse.json({ message: "카테고리를 찾을 수 없습니다" }, { status: 404 });
      }
      data.categoryId = body.categoryId;
      data.category = category.name;
    } else {
      data.categoryId = null;
      data.category = null;
    }
  }
  if (body.admissionMode) data.admissionMode = body.admissionMode;
  if ("coverImage" in body) data.coverImage = body.coverImage || null;
  if (Array.isArray(body.images)) {
    data.images = body.images.filter(
      (u: unknown): u is string => typeof u === "string" && u.length > 0,
    );
  }
  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
    if (body.isActive) {
      data.closedAt = null;
      data.closedReason = null;
    } else {
      data.closedAt = new Date();
      data.closedReason = "슈퍼어드민에 의해 비노출 처리됨";
    }
  }
  if ("businessId" in body && typeof body.businessId === "string" && body.businessId) {
    const biz = await prisma.business.findUnique({
      where: { id: body.businessId },
      select: { id: true },
    });
    if (!biz) {
      return NextResponse.json({ message: "업체를 찾을 수 없습니다" }, { status: 404 });
    }
    data.businessId = body.businessId;
  }

  const formFieldIds: string[] | undefined = Array.isArray(body.formFieldIds)
    ? body.formFieldIds
    : undefined;

  const targetBusinessId =
    (typeof data.businessId === "string" ? data.businessId : null) ?? party.businessId;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.party.update({ where: { id: partyId }, data });
    }
    if (formFieldIds && targetBusinessId) {
      const ownedFields = await tx.businessFormField.findMany({
        where: { id: { in: formFieldIds }, businessId: targetBusinessId },
        select: { id: true },
      });
      const validIds = new Set(ownedFields.map((f) => f.id));
      await tx.partyFormField.deleteMany({ where: { partyId } });
      await tx.partyFormField.createMany({
        data: formFieldIds
          .filter((fid) => validIds.has(fid))
          .map((fid, idx) => ({ partyId, fieldId: fid, order: idx })),
      });
    }
  });

  if (body.isActive === false) {
    await proxyBackendInternal(`/internal/chat/party/${partyId}/close`, {});
  }

  return NextResponse.json({ success: true });
}
