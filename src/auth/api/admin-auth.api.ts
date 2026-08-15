import { adminFetchJson } from "@/auth/api/admin-http";
import {
  getAdminApiBaseUrl,
  selectReachableAdminApiBaseUrl,
} from "@/auth/api/admin-api-origin";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import type {
  LoginResponse,
  MeResponse,
  RefreshResponse,
} from "@/auth/model/admin-auth.types";

export async function loginWithPassword(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): Promise<LoginResponse> {
  const origin = await selectReachableAdminApiBaseUrl();
  return adminFetchJson<LoginResponse>(`${origin}/auth/v2/admin/login`, {
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
    const origin = await selectReachableAdminApiBaseUrl();
    res = await fetch(`${origin}/auth/v2/admin/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCookie: true }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new AdminAuthError(
      "NETWORK_ERROR",
      "인증 서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해 주세요.",
      { permanent: false },
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    throw new AdminAuthError(
      body.code ?? "UNAUTHORIZED",
      body.message ?? "Refresh failed",
      {
        status: res.status,
        permanent: res.status === 401 || res.status === 403,
      },
    );
  }

  return (await res.json()) as RefreshResponse;
}

export async function fetchAdminMe(): Promise<MeResponse> {
  return adminFetchJson<MeResponse>(
    `${getAdminApiBaseUrl()}/auth/v2/admin/me`,
    {
      method: "GET",
    },
  );
}

export async function logoutSession(): Promise<void> {
  await adminFetchJson<{ message: string }>("/auth/v2/admin/logout", {
    method: "POST",
    body: JSON.stringify({}),
    skipAuthRefresh: true,
  });
}
