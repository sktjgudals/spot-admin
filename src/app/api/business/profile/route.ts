import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const MAX_TAGLINE = 80;
const MAX_DESCRIPTION = 2000;

/** 업체 어드민 — 자기 업체 프로필 조회 */
export async function GET() {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "BUSINESS_REQUIRED" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      tagline: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      status: true,
      _count: { select: { parties: { where: { isActive: true } } } },
    },
  });
  if (!business) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    id: business.id,
    name: business.name,
    tagline: business.tagline,
    description: business.description,
    logoUrl: business.logoUrl,
    coverUrl: business.coverUrl,
    status: business.status,
    activePartyCount: business._count.parties,
  });
}

/** 업체 어드민 — 자기 업체 프로필 수정 (앱 노출 필드) */
export async function PATCH(req: NextRequest) {
  const { session, error } = await requireRole("BUSINESS");
  if (error) return error;

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ message: "BUSINESS_REQUIRED" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "INVALID_BODY" }, { status: 400 });
  }

  const data: {
    tagline?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    coverUrl?: string | null;
  } = {};

  if ("tagline" in body) {
    const v = body.tagline;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ message: "tagline must be string|null" }, { status: 400 });
    }
    if (typeof v === "string" && v.length > MAX_TAGLINE) {
      return NextResponse.json(
        { message: `tagline은 ${MAX_TAGLINE}자 이하여야 합니다` },
        { status: 400 },
      );
    }
    data.tagline = typeof v === "string" ? v.trim() || null : null;
  }

  if ("description" in body) {
    const v = body.description;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json(
        { message: "description must be string|null" },
        { status: 400 },
      );
    }
    if (typeof v === "string" && v.length > MAX_DESCRIPTION) {
      return NextResponse.json(
        { message: `description은 ${MAX_DESCRIPTION}자 이하여야 합니다` },
        { status: 400 },
      );
    }
    data.description = typeof v === "string" ? v.trim() || null : null;
  }

  if ("logoUrl" in body) {
    const v = body.logoUrl;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ message: "logoUrl must be string|null" }, { status: 400 });
    }
    data.logoUrl = typeof v === "string" ? v.trim() || null : null;
  }

  if ("coverUrl" in body) {
    const v = body.coverUrl;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ message: "coverUrl must be string|null" }, { status: 400 });
    }
    data.coverUrl = typeof v === "string" ? v.trim() || null : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "수정할 필드가 없습니다" }, { status: 400 });
  }

  const updated = await prisma.business.update({
    where: { id: businessId },
    data,
    select: {
      id: true,
      name: true,
      tagline: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
    },
  });

  return NextResponse.json(updated);
}
