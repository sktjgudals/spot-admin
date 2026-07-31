/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 *
 * 역할 변경은 Nest `POST /internal/users/:userId/role` 로 위임한다.
 * (Prisma 직접 업데이트만 하면 Redis SecurityContext 가 남아 앱 403 이 난다.)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
type UserRole = (typeof ROLES)[number];

function isRole(v: unknown): v is UserRole {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** 유저 권한 변경 — USER(일반) · ADMIN(업체 어드민) · SUPER_ADMIN(슈퍼 어드민) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!isRole(body?.role)) {
    return NextResponse.json({ message: "잘못된 권한 값" }, { status: 400 });
  }

  const role = body.role;
  if (role === "ADMIN") {
    if (typeof body?.businessId !== "string" || !body.businessId) {
      return NextResponse.json({ message: "업체를 선택해주세요" }, { status: 400 });
    }
  }

  // Nest: DB 업데이트 + Redis 권한 캐시 무효화
  return proxyBackendInternal(`/internal/users/${encodeURIComponent(userId)}/role`, {
    role,
    businessId: role === "ADMIN" ? body.businessId : null,
  });
}
