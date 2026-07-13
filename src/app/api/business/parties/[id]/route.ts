import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

interface Params {
  params: Promise<{ id: string }>;
}

/** 파티 소유권 확인 후 파티를 반환. 없거나 소유 아님이면 error 응답을 담아 반환. */
async function loadOwnedParty(id: string, businessId: string | null | undefined) {
  const party = await prisma.party.findUnique({ where: { id } });
  if (!party) {
    return { party: null, error: NextResponse.json({ message: "NOT_FOUND" }, { status: 404 }) };
  }
  if (party.businessId !== businessId) {
    return { party: null, error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { party, error: null as NextResponse | null };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const { id } = await params;
  const owned = await loadOwnedParty(id, session.user.businessId);
  if (owned.error) return owned.error;

  const formFields = await prisma.partyFormField.findMany({
    where: { partyId: id },
    orderBy: { order: "asc" },
    select: { fieldId: true },
  });

  return NextResponse.json({
    ...owned.party,
    formFieldIds: formFields.map((f) => f.fieldId),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  const { id } = await params;
  const owned = await loadOwnedParty(id, businessId);
  if (owned.error) return owned.error;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  }

  // 부분 업데이트 — 전달된 필드만 반영
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
  // categoryId 지정 시 이름 사본(category)도 함께 갱신, 빈 값이면 연결 해제
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
      data.closedReason = "업체에 의해 비노출 처리됨";
    }
  }


  // 파티 커스텀 폼 선택 재구성 (전달된 경우에만)
  const formFieldIds: string[] | undefined = Array.isArray(body.formFieldIds)
    ? body.formFieldIds
    : undefined;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.party.update({ where: { id }, data });
    }
    if (formFieldIds) {
      // 선택한 질문이 이 업체 소유인지 검증
      const ownedFields = await tx.businessFormField.findMany({
        where: { id: { in: formFieldIds }, businessId: businessId! },
        select: { id: true },
      });
      const validIds = new Set(ownedFields.map((f) => f.id));
      await tx.partyFormField.deleteMany({ where: { partyId: id } });
      await tx.partyFormField.createMany({
        data: formFieldIds
          .filter((fid) => validIds.has(fid))
          .map((fid, idx) => ({ partyId: id, fieldId: fid, order: idx })),
      });
    }
  });

  // Soft Close 시 채팅방 소켓 kick
  if (body.isActive === false) {
    await proxyBackendInternal(`/internal/chat/party/${id}/close`, {});
  }

  return NextResponse.json({ success: true });
}
