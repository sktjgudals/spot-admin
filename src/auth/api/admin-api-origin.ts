import { AdminAuthError } from "@/auth/model/admin-auth.errors";

const ACTIVE_ORIGIN_STORAGE_KEY = "dopa-admin-api-origin";
const HEALTH_TIMEOUT_MS = 4_000;
const HEALTH_CACHE_TTL_MS = 30_000;

const healthCache = new Map<string, { ok: true; at: number }>();

export function resetHealthProbeCacheForTests() {
  healthCache.clear();
}

function normalizeOrigin(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\/$/, "") ?? "";
  return normalized.length > 0 ? normalized : null;
}

function configuredOrigins(): string[] {
  const primary =
    normalizeOrigin(process.env.NEXT_PUBLIC_API_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_NEST_API_URL) ??
    (process.env.NODE_ENV === "development" ? "http://localhost:8787" : null);
  if (!primary) {
    throw new AdminAuthError(
      "API_URL_MISSING",
      "NEXT_PUBLIC_API_URL is not configured",
      { permanent: true },
    );
  }
  const fallback = normalizeOrigin(process.env.NEXT_PUBLIC_API_FALLBACK_URL);
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

function storedOrigin(origins: string[]): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ACTIVE_ORIGIN_STORAGE_KEY);
    return stored && origins.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function rememberOrigin(origin: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_ORIGIN_STORAGE_KEY, origin);
  } catch {
    // Private browsing or a storage policy may reject localStorage.
  }
}

/** Current direct Cloudflare API origin; never routes through an Admin BFF. */
export function getAdminApiBaseUrl(): string {
  const origins = configuredOrigins();
  return storedOrigin(origins) ?? origins[0];
}

/**
 * Select a reachable production API before sending credentials.
 *
 * The health probe makes login failover safe: credentials are sent only once,
 * so a lost login response cannot create a second session on the fallback
 * hostname.
 */
export async function selectReachableAdminApiBaseUrl(): Promise<string> {
  const origins = configuredOrigins();
  const active = storedOrigin(origins);
  const candidates = active
    ? [active, ...origins.filter((origin) => origin !== active)]
    : origins;
  const now = Date.now();

  for (const origin of candidates) {
    const cached = healthCache.get(origin);
    if (cached && now - cached.at < HEALTH_CACHE_TTL_MS) {
      rememberOrigin(origin);
      return origin;
    }
    try {
      const response = await fetch(`${origin}/health`, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (response.ok) {
        healthCache.set(origin, { ok: true, at: now });
        rememberOrigin(origin);
        return origin;
      }
    } catch {
      healthCache.delete(origin);
    }
  }

  throw new AdminAuthError(
    "NETWORK_ERROR",
    "인증 서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해 주세요.",
    { permanent: false },
  );
}
