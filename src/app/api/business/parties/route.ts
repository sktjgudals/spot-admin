import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { assertBusinessHost } from "@/lib/business-hosts";

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

  // 업체 어드민 계정을 파티 호스트(adminId)로 사용하기 위해
  // 업체에 연결된 spot User 계정이 없으므로 임시로 업체 소유 파티에 가상 User를 쓸 수 없음.
  // -> spot-backend의 User 없이는 adminId FK를 채울 수 없음.
  // 실제 구현시: 업체 어드민이 연결된 User.id를 adminAccount에 추가하거나
  //              별도 업체 전용 User를 생성하는 방식 필요.
  // 여기서는 업체 정보에서 연결된 첫 번째 User(호스트)를 찾는 방식으로 처리.

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { admins: { take: 1 } },
  });

  if (!business) {
    return NextResponse.json({ message: "업체를 찾을 수 없습니다" }, { status: 404 });
  }

  // 호스트: body.adminId 우선, 없으면 contactEmail 매칭 User (레거시)
  let hostUserId: string | null = null;
  if (typeof body.adminId === "string" && body.adminId) {
    const hostCheck = await assertBusinessHost(businessId, body.adminId);
    if (!hostCheck.ok) {
      return NextResponse.json({ message: hostCheck.message }, { status: 400 });
    }
    hostUserId = body.adminId;
  } else {
    const hostUser = business.contactEmail
      ? await prisma.user.findUnique({ where: { email: business.contactEmail } })
      : null;
    hostUserId = hostUser?.id ?? null;
  }

  if (!hostUserId) {
    return NextResponse.json(
      {
        message:
          "파티 호스트를 지정할 수 없습니다. 담당자를 선택하거나, 업체 contactEmail에 spot 앱 계정 이메일을 설정해 주세요.",
      },
      { status: 400 },
    );
  }

  // 카테고리 선택 시 이름을 category(비정규화·구버전 앱 호환)에 함께 저장
  let categoryName: string | null = body.category || null;
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
      isActive: body.isActive ?? true, // 기본 노출
      adminId: hostUserId,
      businessId,
    },
  });

  const formFieldIds: string[] = Array.isArray(body.formFieldIds)
    ? body.formFieldIds
    : [];
  if (formFieldIds.length > 0) {
    // 선택한 질문이 이 업체 소유인지 검증 후 연결
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
