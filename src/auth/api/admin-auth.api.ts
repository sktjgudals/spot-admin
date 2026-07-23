import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import type {
  LoginResponse,
  MeResponse,
  RefreshResponse,
} from "@/auth/model/admin-auth.types";

function apiBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_NEST_API_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  if (!base) {
    throw new AdminAuthError(
      "API_URL_MISSING",
      "NEXT_PUBLIC_API_URL is not configured",
      { permanent: true },
    );
  }
  return base.replace(/\/$/, "");
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): Promise<LoginResponse> {
  return adminFetchJson<LoginResponse>("/auth/v2/admin/login", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      rememberMe: input.rememberMe ?? false,
      useCookie: true,
      platform: "web",
    }),
    skipAuthRefresh: true,
  });
}

/**
 * Cookie-based refresh — raw fetch (no interceptor) to avoid circular refresh.
 */
export async function refreshSession(): Promise<RefreshResponse> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/auth/v2/admin/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCookie: true }),
    });
  } catch {
    throw new AdminAuthError("NETWORK_ERROR", "Network error — check connection", {
      permanent: false,
    });
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    throw new AdminAuthError(
      body.code ?? "UNAUTHORIZED",
      body.message ?? "Refresh failed",
      { status: res.status, permanent: res.status === 401 || res.status === 403 },
    );
  }

  return (await res.json()) as RefreshResponse;
}

export async function fetchAdminMe(): Promise<MeResponse> {
  return adminFetchJson<MeResponse>("/auth/v2/admin/me", {
    method: "GET",
  });
}

export async function logoutSession(): Promise<void> {
  await adminFetchJson<{ message: string }>("/auth/v2/admin/logout", {
    method: "POST",
    body: JSON.stringify({}),
    skipAuthRefresh: true,
  });
}
