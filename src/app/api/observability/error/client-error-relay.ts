const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

export function clientErrorRelayAllowedOrigin(
  origin: string | null,
  host: string | null,
): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function parseClientErrorBody(raw: unknown): {
  title: string;
  path?: string;
  digest?: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return null;
  return {
    title,
    ...(typeof body.path === "string" && body.path.trim()
      ? { path: body.path.trim().slice(0, 200) }
      : {}),
    ...(typeof body.digest === "string" && body.digest.trim()
      ? { digest: body.digest.trim().slice(0, 64) }
      : {}),
  };
}

export function consumeClientErrorRateLimit(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function resetClientErrorRateLimitForTests() {
  hits.clear();
}
