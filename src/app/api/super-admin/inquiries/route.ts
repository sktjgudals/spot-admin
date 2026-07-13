import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/** 문의 목록 */
export async function GET() {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const inquiries = await prisma.inquiry.findMany({
    orderBy: [{ isResolved: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { user: { select: { nickname: true, email: true } } },
  });

  return NextResponse.json(
    inquiries.map((i) => ({
      id: i.id,
      nickname:
        i.user?.nickname ?? (i.source === "WEB" ? "웹 문의" : "앱 유저"),
      email: i.user?.email ?? i.contact ?? "-",
      message: i.message,
      contact: i.contact,
      source: i.source,
      isResolved: i.isResolved,
      createdAt: i.createdAt.toISOString(),
    })),
  );
}
