import { getAccessToken } from "@/auth/store/admin-auth.store";
import { refreshAccessToken } from "@/auth/refresh/refresh-single-flight";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { getAdminApiBaseUrl } from "@/auth/api/admin-api-origin";

export type AdminFetchInit = RequestInit & {
  /** Skip 401 → refresh → retry (login/refresh/logout) */
  skipAuthRefresh?: boolean;
  /** Internal: already retried once */
  _authRetried?: boolean;
};

const REQUEST_TIMEOUT_MS = 12_000;

function requestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isAuthPath(path: string): boolean {
  return (
    path.includes("/auth/v2/admin/login") ||
    path.includes("/auth/v2/admin/oidc-login") ||
    path.includes("/auth/v2/admin/refresh") ||
    path.includes("/auth/v2/admin/logout")
  );
}

/**
 * Fetch against Cloudflare Admin Auth / Admin v2 APIs.
 * Always credentials:include for HttpOnly refresh cookies.
 */
export async function adminFetch(
  path: string,
  init: AdminFetchInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${getAdminApiBaseUrl()}${path}`;
  const headers = new Headers(init.headers);

  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
      signal: requestSignal(init.signal),
    });
  } catch {
    throw new AdminAuthError(
      "NETWORK_ERROR",
      "인증 서버와 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.",
      { permanent: false },
    );
  }

  const skip =
    init.skipAuthRefresh === true ||
    init._authRetried === true ||
    isAuthPath(path);

  if (res.status === 401 && !skip) {
    try {
      const newToken = await refreshAccessToken();
      headers.set("Authorization", `Bearer ${newToken}`);
      return adminFetch(path, {
        ...init,
        headers,
        skipAuthRefresh: true,
        _authRetried: true,
      });
    } catch (err) {
      if (err instanceof AdminAuthError) throw err;
      throw new AdminAuthError("UNAUTHORIZED", "Session expired", {
        status: 401,
        permanent: true,
      });
    }
  }

  return res;
}

export async function adminFetchJson<T>(
  path: string,
  init: AdminFetchInit = {},
): Promise<T> {
  const res = await adminFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
      code?: string;
    };
    const msg = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message ?? `Request failed (${res.status})`);
    throw new AdminAuthError(body.code ?? "HTTP_ERROR", msg, {
      status: res.status,
      permanent: res.status === 401 || res.status === 403,
    });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
