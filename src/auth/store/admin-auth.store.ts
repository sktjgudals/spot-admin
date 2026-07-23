/**
 * Access token lives in module memory only (not localStorage / sessionStorage).
 * Refresh token is HttpOnly cookie set by Nest — never stored here.
 */

let accessToken: string | null = null;
const listeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((l) => l());
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
  listeners.clear();
}
