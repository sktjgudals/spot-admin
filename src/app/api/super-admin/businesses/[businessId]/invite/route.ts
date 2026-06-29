import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const body = await req.json().catch(() => ({}));

  if (!body.email) {
    return NextResponse.json({ message: "이메일이 필요합니다" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7일

  const invitation = await prisma.businessInvitation.create({
    data: {
      email: body.email,
      businessId,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

  return NextResponse.json({ inviteUrl, expiresAt }, { status: 201 });
}
