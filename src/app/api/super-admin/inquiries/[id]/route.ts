import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/** 문의 처리 상태 변경 — isResolved 토글 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.isResolved !== "boolean") {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  }

  try {
    const updated = await prisma.inquiry.update({
      where: { id },
      data: { isResolved: body.isResolved },
    });
    return NextResponse.json({ id: updated.id, isResolved: updated.isResolved });
  } catch {
    return NextResponse.json({ message: "문의를 찾을 수 없습니다" }, { status: 404 });
  }
}
