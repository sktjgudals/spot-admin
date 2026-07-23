import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { AdminRole } from "@/generated/prisma";
import { trackLegacyBffAuth } from "@/lib/legacy-bff";

/**
 * @deprecated
 * Temporary Auth v2-compatible BFF auth helper for Next.js `/api/**` routes.
 * Owner: Admin Platform
 * Replacement: Call Nest `/admin/v2/*` and `/auth/v2/admin/*` from the browser (AuthShell).
 * Removal target: 2026-10 (per docs/LEGACY_BFF_INVENTORY.md)
 *
 * Verifies Nest Admin JWT via GET /auth/v2/admin/me (Bearer).
 * NextAuth removed — do not use NEXTAUTH_* cookies.
 *
 * Metrics (all envs): legacy_bff_requests_total — no tokens/cookies/PII.
 */

export type AuthSessionUser = {
  id: string;
  email: string;
  name: string;
  /** Legacy enum surface: SUPER_ADMIN | BUSINESS (maps BUSINESS_ADMIN) */
  role: AdminRole;
  businessId?: string;
  businessName?: string;
};

export type AuthSession = {
  user: AuthSessionUser;
};

type AuthSuccess = { session: AuthSession; error: null };
type AuthError = { session: null; error: NextResponse };
type AuthResult = AuthSuccess | AuthError;

function nestBaseUrl(): string {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Map Nest AdminRole → legacy Prisma AdminRole used by BFF routes. */
export function toLegacyAdminRole(role: string): AdminRole {
  if (role === "SUPER_ADMIN") return AdminRole.SUPER_ADMIN;
  if (
    role === "BUSINESS_ADMIN" ||
    role === "BUSINESS" ||
    role === "PARTNER_ADMIN" ||
    role === AdminRole.BUSINESS
  ) {
    return AdminRole.BUSINESS;
  }
  return role as AdminRole;
}

async function resolveSessionFromBearer(): Promise<AuthSession | null> {
  const h = await headers();
  const authorization = h.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const res = await fetch(`${nestBaseUrl()}/auth/v2/admin/me`, {
      method: "GET",
      headers: { Authorization: authorization },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const me = (await res.json()) as {
      id: string;
      email: string;
      name: string;
      role: string;
      businessId: string | null;
      business?: { name?: string } | null;
    };
    return {
      user: {
        id: me.id,
        email: me.email,
        name: me.name,
        role: toLegacyAdminRole(me.role),
        businessId: me.businessId ?? undefined,
        businessName: me.business?.name,
      },
    };
  } catch {
    return null;
  }
}

function headerGetter() {
  return headers();
}

export async function requireRole(role: AdminRole): Promise<AuthResult> {
  const session = await resolveSessionFromBearer();
  if (!session) {
    await trackLegacyBffAuth({
      status: "unauthorized",
      role: "anonymous",
      headerGetter,
    });
    return {
      session: null,
      error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== role) {
    await trackLegacyBffAuth({
      status: "forbidden",
      role: String(session.user.role),
      headerGetter,
    });
    return {
      session: null,
      error: NextResponse.json({ message: "Forbidden" }, { status: 403 }),
    };
  }
  await trackLegacyBffAuth({
    status: "ok",
    role: String(session.user.role),
    headerGetter,
  });
  return { session, error: null };
}

export async function requireAnyRole(): Promise<AuthResult> {
  const session = await resolveSessionFromBearer();
  if (!session) {
    await trackLegacyBffAuth({
      status: "unauthorized",
      role: "anonymous",
      headerGetter,
    });
    return {
      session: null,
      error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }
  await trackLegacyBffAuth({
    status: "ok",
    role: String(session.user.role),
    headerGetter,
  });
  return { session, error: null };
}
