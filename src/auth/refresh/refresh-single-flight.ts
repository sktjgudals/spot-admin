import { getAccessToken, setAccessToken } from "@/auth/store/admin-auth.store";
import { refreshSession } from "@/auth/api/admin-auth.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import type { RefreshResponse } from "@/auth/model/admin-auth.types";

let refreshPromise: Promise<RefreshResponse> | null = null;

/**
 * Single-flight refresh shared by interceptors and boot restore.
 * Concurrent callers share one network request.
 */
export function refreshAdminSession(): Promise<RefreshResponse> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const res = await refreshSession();
    setAccessToken(res.accessToken);
    return res;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function refreshAccessToken(): Promise<string> {
  return refreshAdminSession().then((session) => session.accessToken);
}

/**
 * Ensure we have a non-null access token (refresh if missing).
 * Does not call /me — caller loads profile.
 */
export async function ensureAccessToken(): Promise<string> {
  const existing = getAccessToken();
  if (existing) return existing;
  return refreshAccessToken();
}

export function __resetRefreshFlightForTests(): void {
  refreshPromise = null;
}

export function isRefreshInFlight(): boolean {
  return refreshPromise != null;
}

export function assertRefreshFailedUnauthorized(err: unknown): boolean {
  return (
    err instanceof AdminAuthError &&
    (err.status === 401 || err.code === "UNAUTHORIZED")
  );
}
