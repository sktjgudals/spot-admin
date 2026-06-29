import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.token || !body?.name || !body?.password) {
    return NextResponse.json({ message: "필수 항목이 누락되었습니다" }, { status: 400 });
  }

  const invitation = await prisma.businessInvitation.findUnique({
    where: { token: body.token },
  });

  if (!invitation || invitation.used || invitation.expiresAt < new Date()) {
    return NextResponse.json({ message: "유효하지 않거나 만료된 초대 링크입니다" }, { status: 400 });
  }

  const existing = await prisma.adminAccount.findUnique({
    where: { email: invitation.email },
  });
  if (existing) {
    return NextResponse.json({ message: "이미 가입된 이메일입니다" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  await prisma.$transaction([
    prisma.adminAccount.create({
      data: {
        email: invitation.email,
        passwordHash,
        name: body.name,
        role: "BUSINESS",
        businessId: invitation.businessId,
      },
    }),
    prisma.businessInvitation.update({
      where: { id: invitation.id },
      data: { used: true },
    }),
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
