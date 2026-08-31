/**
 * Access token lives in module memory only (not localStorage / sessionStorage).
 * Refresh token is an HttpOnly cookie set by the API — never stored here.
 */

import type { AdminWebRole } from "@/auth/model/admin-auth.types";

export type AdminSessionPrincipal = {
  id: string;
  role: AdminWebRole;
  businessId: string | null;
};

let accessToken: string | null = null;
let adminSessionPrincipal: AdminSessionPrincipal | null = null;
let adminSessionGeneration = 0;
const listeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function getAdminSessionPrincipal(): AdminSessionPrincipal | null {
  return adminSessionPrincipal ? { ...adminSessionPrincipal } : null;
}

/** Monotonic boundary epoch used to discard responses from a replaced session. */
export function getAdminSessionGeneration(): number {
  return adminSessionGeneration;
}

export function setAccessToken(token: string | null): void {
  const principalChanged = token === null && adminSessionPrincipal !== null;
  const tokenChanged = token !== accessToken;
  accessToken = token;
  if (token === null) {
    adminSessionPrincipal = null;
  }
  if (!tokenChanged && !principalChanged) return;
  adminSessionGeneration += 1;
  listeners.forEach((l) => l());
}

/** Adopt a token and its authorization boundary in one observable update. */
export function setAuthenticatedAdminSession(
  token: string,
  principal: AdminSessionPrincipal,
): void {
  const nextPrincipal = { ...principal };
  const changed =
    accessToken !== token ||
    adminSessionPrincipal?.id !== nextPrincipal.id ||
    adminSessionPrincipal?.role !== nextPrincipal.role ||
    adminSessionPrincipal?.businessId !== nextPrincipal.businessId;

  accessToken = token;
  adminSessionPrincipal = nextPrincipal;
  if (!changed) return;
  adminSessionGeneration += 1;
  listeners.forEach((listener) => listener());
}

/** Rotate a token without replacing the authorization boundary. */
export function setRefreshedAdminSession(
  token: string,
  principal: AdminSessionPrincipal,
): void {
  const current = adminSessionPrincipal;
  const samePrincipal =
    current !== null &&
    current.id === principal.id &&
    current.role === principal.role &&
    current.businessId === principal.businessId;

  if (!samePrincipal) {
    setAuthenticatedAdminSession(token, principal);
    return;
  }
  if (accessToken === token) return;
  accessToken = token;
  adminSessionPrincipal = { ...principal };
  listeners.forEach((listener) => listener());
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export function subscribeAccessToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper */
export function __resetAccessTokenForTests(): void {
  accessToken = null;
  adminSessionPrincipal = null;
  adminSessionGeneration = 0;
  listeners.clear();
}
