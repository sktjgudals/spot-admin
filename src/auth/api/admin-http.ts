import { getAccessToken } from "@/auth/store/admin-auth.store";
import { refreshAccessToken } from "@/auth/refresh/refresh-single-flight";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

export type AdminFetchInit = RequestInit & {
  /** Skip 401 → refresh → retry (login/refresh/logout) */
  skipAuthRefresh?: boolean;
  /** Internal: already retried once */
  _authRetried?: boolean;
};

function apiBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_NEST_API_URL ??
    "";
  if (!base) {
    // Dev fallback: Nest default port (browser must hit Nest CORS with credentials)
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:3000";
    }
    throw new AdminAuthError(
      "API_URL_MISSING",
      "NEXT_PUBLIC_API_URL is not configured",
      { permanent: true },
    );
  }
  return base.replace(/\/$/, "");
}

function isAuthPath(path: string): boolean {
  return (
    path.includes("/auth/v2/admin/login") ||
    path.includes("/auth/v2/admin/refresh") ||
    path.includes("/auth/v2/admin/logout")
  );
}

/**
 * Fetch against Nest Admin Auth / Admin v2 APIs.
 * Always credentials:include for HttpOnly refresh cookies.
 */
export async function adminFetch(
  path: string,
  init: AdminFetchInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${apiBaseUrl()}${path}`;
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
    });
  } catch {
    throw new AdminAuthError(
      "NETWORK_ERROR",
      "Network error — check connection",
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
      : body.message ?? `Request failed (${res.status})`;
    throw new AdminAuthError(body.code ?? "HTTP_ERROR", msg, {
      status: res.status,
      permanent: res.status === 401 || res.status === 403,
    });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
