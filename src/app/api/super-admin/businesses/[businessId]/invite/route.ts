/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string }>;
}

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const body = await req.json().catch(() => ({}));

  if (!body.email) {
    return NextResponse.json({ message: "이메일이 필요합니다" }, { status: 400 });
  }

  const email = String(body.email).trim().toLowerCase();
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7일
  const rawToken = generateSecureToken();
  const tokenHash = sha256Hex(rawToken);

  // 재발송 시 동일 이메일+업체 PENDING 초대 무효화
  await prisma.businessInvitation.updateMany({
    where: {
      email,
      businessId,
      status: "PENDING",
      used: false,
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  const invitation = await prisma.businessInvitation.create({
    data: {
      email,
      businessId,
      // dual-read: path lookup still uses plain token during transition
      token: rawToken,
      tokenHash,
      role: body.role === "PARTNER_MEMBER" ? "PARTNER_MEMBER" : "PARTNER_ADMIN",
      status: "PENDING",
      invitedBy: session?.user?.id,
      expiresAt,
    },
  });

  // 절대 URL은 클라이언트가 window.location.origin으로 붙인다 (localhost 폴백 방지)
  // raw token은 응답에만 노출 — DB 조회는 token 또는 tokenHash
  return NextResponse.json(
    {
      token: rawToken,
      path: `/invite/${rawToken}`,
      expiresAt,
      invitationId: invitation.id,
    },
    { status: 201 },
  );
}
