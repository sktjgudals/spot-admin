/** Canonical roles for Auth v2 Admin Web (Nest AdminRole subset). */
export type AdminWebRole = "SUPER_ADMIN" | "BUSINESS_ADMIN";

export type AuthStatus = "booting" | "authenticated" | "unauthenticated" | "degraded";

export type AdminProfile = {
  id: string;
  email: string;
  name: string;
  role: AdminWebRole;
  businessId: string | null;
  status?: string;
  business?: {
    id: string;
    name: string;
    status: string;
    deletedAt: string | null;
  } | null;
};

export type AdminAuthState = {
  status: AuthStatus;
  accessToken: string | null;
  admin: AdminProfile | null;
  /** Transient boot/network error (not session expiry) */
  bootError: string | null;
};

export type LoginResponse = {
  accessToken: string;
  sessionId: string;
  admin: {
    id: string;
    email: string;
    name: string;
    role: string;
    businessId: string | null;
    status: string;
  };
  refreshDelivery?: "cookie" | "body";
  refreshToken?: string;
};

export type RefreshResponse = {
  accessToken: string;
  sessionId: string;
  admin: LoginResponse["admin"];
  refreshDelivery?: "cookie" | "body";
  refreshToken?: string;
};

export type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  businessId: string | null;
  business: {
    id: string;
    name: string;
    status: string;
    deletedAt: string | null;
  } | null;
};

/** Normalize Nest AdminRole (incl. legacy) → Web roles. */
export function normalizeAdminWebRole(role: string): AdminWebRole | null {
  if (role === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (
    role === "BUSINESS_ADMIN" ||
    role === "BUSINESS" ||
    role === "PARTNER_ADMIN"
  ) {
    return "BUSINESS_ADMIN";
  }
  return null;
}

export { homePathForRole } from "@/auth/model/admin-routes";

export function toAdminProfile(
  raw: LoginResponse["admin"] | MeResponse,
): AdminProfile | null {
  const role = normalizeAdminWebRole(raw.role);
  if (!role) return null;
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role,
    businessId: raw.businessId,
    status: "status" in raw ? raw.status : undefined,
    business: "business" in raw ? raw.business : undefined,
  };
}
