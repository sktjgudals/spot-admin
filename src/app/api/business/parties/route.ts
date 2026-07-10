import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

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

  // spot DB에서 업체 이메일로 일치하는 User 찾기 (연결 호스트)
  const hostUser = business.contactEmail
    ? await prisma.user.findUnique({ where: { email: business.contactEmail } })
    : null;

  if (!hostUser) {
    return NextResponse.json(
      { message: "파티 호스트 연결을 위한 spot 계정이 없습니다. 업체 담당자의 spot 앱 계정 이메일을 업체 contactEmail에 설정해 주세요." },
      { status: 400 }
    );
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
      category: body.category || null,
      admissionMode: body.admissionMode ?? "APPROVAL",
      coverImage: body.coverImage || null,
      isActive: body.isActive ?? true, // 기본 노출
      adminId: hostUser.id,
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
