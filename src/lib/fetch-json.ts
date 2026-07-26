import { getAccessToken } from "@/auth/store/admin-auth.store";
import { refreshAccessToken } from "@/auth/refresh/refresh-single-flight";

export type BffFetchInit = RequestInit & {
  /** Already retried after refresh */
  _authRetried?: boolean;
};

/**
 * Same-origin BFF fetch with Nest Auth v2 Bearer (+ one-shot refresh on 401).
 * Use for `/api/**` routes that call requireRole / requireAnyRole.
 */
export async function bffFetch(
  input: RequestInfo | URL,
  init: BffFetchInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401 && !init._authRetried) {
    try {
      const newToken = await refreshAccessToken();
      headers.set("Authorization", `Bearer ${newToken}`);
      return bffFetch(input, {
        ...init,
        headers,
        _authRetried: true,
      });
    } catch {
      return res;
    }
  }

  return res;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: BffFetchInit,
): Promise<T> {
  const res = await bffFetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body === "object" &&
      body &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
