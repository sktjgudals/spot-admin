import { getAccessToken, setAccessToken } from "@/auth/store/admin-auth.store";
import { refreshSession } from "@/auth/api/admin-auth.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh shared by interceptors and boot restore.
 * Concurrent callers share one network request.
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const res = await refreshSession();
    setAccessToken(res.accessToken);
    return res.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
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
