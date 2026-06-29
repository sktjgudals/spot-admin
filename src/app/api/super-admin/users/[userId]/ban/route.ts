import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ userId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ message: "USER_NOT_FOUND" }, { status: 404 });

  await prisma.user.update({
    where: { id: userId },
    data: {
      isBlocked: true,
      blockedUntil: body.blockedUntil ? new Date(body.blockedUntil) : null,
      blockReason: body.reason ?? "관리자에 의한 정지",
    },
  });

  return NextResponse.json({ success: true });
}
