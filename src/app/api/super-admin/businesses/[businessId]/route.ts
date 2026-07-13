import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "INVALID_BODY" }, { status: 400 });
  }

  const data: { feeRateBps?: number; kind?: "INDIVIDUAL" | "COMPANY" } = {};

  if ("feeRateBps" in body) {
    const feeRateBps = Number(body.feeRateBps);
    if (!Number.isInteger(feeRateBps) || feeRateBps < 0 || feeRateBps > 10000) {
      return NextResponse.json(
        { message: "feeRateBps는 0~10000 사이 정수여야 합니다 (1000 = 10%)" },
        { status: 400 },
      );
    }
    data.feeRateBps = feeRateBps;
  }

  if ("kind" in body) {
    if (body.kind !== "INDIVIDUAL" && body.kind !== "COMPANY") {
      return NextResponse.json(
        { message: "kind는 INDIVIDUAL | COMPANY" },
        { status: 400 },
      );
    }
    data.kind = body.kind;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "수정할 필드가 없습니다" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  const updated = await prisma.business.update({
    where: { id: businessId },
    data,
    select: { id: true, name: true, feeRateBps: true, kind: true },
  });

  return NextResponse.json(updated);
}
