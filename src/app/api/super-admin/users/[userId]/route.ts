import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ userId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { userId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "INVALID_BODY" }, { status: 400 });
  }

  const data: { nickname?: string } = {};

  if ("nickname" in body) {
    if (typeof body.nickname !== "string" || !body.nickname.trim()) {
      return NextResponse.json(
        { message: "닉네임은 1자 이상이어야 합니다" },
        { status: 400 },
      );
    }
    const nickname = body.nickname.trim();
    if (nickname.length > 30) {
      return NextResponse.json(
        { message: "닉네임은 30자 이하여야 합니다" },
        { status: 400 },
      );
    }
    data.nickname = nickname;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "수정할 필드가 없습니다" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, nickname: true },
  });

  return NextResponse.json(updated);
}
