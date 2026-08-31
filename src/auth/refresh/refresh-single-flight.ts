import {
  clearAccessToken,
  getAdminSessionGeneration,
  getAdminSessionPrincipal,
  getAccessToken,
  setRefreshedAdminSession,
  type AdminSessionPrincipal,
} from "@/auth/store/admin-auth.store";
import { refreshSession } from "@/auth/api/admin-auth.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import {
  normalizeAdminWebRole,
  type RefreshResponse,
} from "@/auth/model/admin-auth.types";

let refreshPromise: Promise<RefreshResponse> | null = null;

/**
 * Single-flight refresh shared by interceptors and boot restore.
 * Concurrent callers share one network request.
 */
export function refreshAdminSession(): Promise<RefreshResponse> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshGeneration = getAdminSessionGeneration();
  refreshPromise = (async () => {
    try {
      const res = await refreshSession();
      assertRefreshGeneration(refreshGeneration);
      const nextPrincipal = principalFromRefreshResponse(res);
      const currentPrincipal = getAdminSessionPrincipal();
      if (
        currentPrincipal &&
        !isSamePrincipal(currentPrincipal, nextPrincipal)
      ) {
        throw new AdminAuthError(
          "SESSION_PRINCIPAL_CHANGED",
          "다른 관리자 세션이 감지되어 안전하게 로그아웃했습니다.",
          { status: 401, permanent: true },
        );
      }
      setRefreshedAdminSession(res.accessToken, nextPrincipal);
      return res;
    } catch (error) {
      assertRefreshGeneration(refreshGeneration);
      // Only an explicit credential rejection expires the local session.
      // Network and 5xx failures must remain retryable without erasing state.
      if (assertRefreshFailedUnauthorized(error)) {
        clearAccessToken();
      }
      throw error;
    }
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
    (err.status === 401 || err.status === 403 || err.code === "UNAUTHORIZED")
  );
}

function principalFromRefreshResponse(
  response: RefreshResponse,
): AdminSessionPrincipal {
  const role = normalizeAdminWebRole(response.admin.role);
  if (!role) {
    throw new AdminAuthError(
      "UNSUPPORTED_ROLE",
      "이 역할은 Admin Web에서 지원하지 않습니다",
      { status: 403, permanent: true },
    );
  }
  return {
    id: response.admin.id,
    role,
    businessId: response.admin.businessId,
  };
}

function isSamePrincipal(
  current: AdminSessionPrincipal,
  next: AdminSessionPrincipal,
): boolean {
  return (
    current.id === next.id &&
    current.role === next.role &&
    current.businessId === next.businessId
  );
}

function assertRefreshGeneration(expected: number): void {
  if (getAdminSessionGeneration() === expected) return;
  throw new AdminAuthError(
    "SESSION_CHANGED_DURING_REFRESH",
    "관리자 세션이 변경되어 이전 토큰 갱신 결과를 폐기했습니다.",
    { status: 409, permanent: true },
  );
}
