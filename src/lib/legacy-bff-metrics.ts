/**
 * Production-safe metrics for residual legacy BFF traffic.
 *
 * NEVER label with: access tokens, cookies, raw query, body, email, user id.
 * ALWAYS use normalized route keys (no dynamic IDs) to avoid cardinality blow-up.
 *
 * Metric:
 *   legacy_bff_requests_total{route,method,status,role,environment,caller}
 */

export type LegacyBffMetricLabels = {
  /** e.g. super_admin_businesses, business_parties_list */
  route: string;
  method: string;
  /** auth result or coarse HTTP class: ok | unauthorized | forbidden | error */
  status: string;
  /** SUPER_ADMIN | BUSINESS | anonymous | unknown */
  role: string;
  environment: string;
  /** bff | browser | scrape | unknown */
  caller: string;
};

const counter = new Map<string, number>();

function envName(): string {
  return (
    process.env.APP_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "unknown"
  );
}

function labelsKey(l: LegacyBffMetricLabels): string {
  return [
    l.route,
    l.method,
    l.status,
    l.role,
    l.environment,
    l.caller,
  ].join("|");
}

/**
 * Strip dynamic segments so Prometheus labels stay bounded.
 * /api/super-admin/businesses/clxyz.../invite → super_admin_businesses_id_invite
 */
export function normalizeLegacyBffRoute(
  pathname: string,
  method = "GET",
): string {
  let p = pathname.split("?")[0] ?? pathname;
  p = p.replace(/^\/api\//, "");
  // UUIDs
  p = p.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "id",
  );
  // cuid / long opaque ids (20+ alnum)
  p = p.replace(/\/[a-z0-9_-]{16,}/gi, "/id");
  // numeric ids
  p = p.replace(/\/\d+/g, "/id");
  const route =
    p
      .replace(/\//g, "_")
      .replace(/-/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "unknown";
  void method;
  return route;
}

/**
 * Best-effort path from Next headers (never log full query string).
 */
export async function routeKeyFromHeaders(
  headerGetter: () => Promise<Headers> | Headers,
  method = "UNKNOWN",
): Promise<string> {
  try {
    const h = await headerGetter();
    const candidates = [
      h.get("x-matched-path"),
      h.get("x-invoke-path"),
      h.get("next-url"),
      h.get("x-url"),
      h.get("x-forwarded-uri"),
      h.get("x-original-url"),
    ].filter(Boolean) as string[];

    for (const raw of candidates) {
      try {
        const path = raw.startsWith("http")
          ? new URL(raw).pathname
          : raw.split("?")[0];
        if (path?.includes("/api/")) {
          return normalizeLegacyBffRoute(path, method);
        }
      } catch {
        /* try next */
      }
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

/** Increment counter — safe in all environments including production. */
export function recordLegacyBffRequest(
  partial: Partial<LegacyBffMetricLabels> & { route?: string },
): void {
  const labels: LegacyBffMetricLabels = {
    route: sanitizeLabel(partial.route ?? "unknown", 80),
    method: sanitizeLabel((partial.method ?? "UNKNOWN").toUpperCase(), 16),
    status: sanitizeLabel(partial.status ?? "unknown", 32),
    role: sanitizeLabel(partial.role ?? "unknown", 32),
    environment: sanitizeLabel(partial.environment ?? envName(), 32),
    caller: sanitizeLabel(partial.caller ?? "bff", 32),
  };
  const key = labelsKey(labels);
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function sanitizeLabel(v: string, max: number): string {
  // block accidental token/cookie-like values
  if (v.length > max) return v.slice(0, max);
  if (/bearer\s+/i.test(v)) return "redacted";
  if (v.includes("=") && v.length > 40) return "redacted";
  return v.replace(/[^a-zA-Z0-9_.:-]/g, "_") || "unknown";
}

/** Prometheus text exposition (no PII). */
export function renderLegacyBffMetrics(): string {
  const lines: string[] = [
    "# HELP legacy_bff_requests_total Residual Next.js BFF hits after Auth v2 cutover",
    "# TYPE legacy_bff_requests_total counter",
  ];
  for (const [key, value] of counter.entries()) {
    const [route, method, status, role, environment, caller] = key.split("|");
    lines.push(
      `legacy_bff_requests_total{route="${route}",method="${method}",status="${status}",role="${role}",environment="${environment}",caller="${caller}"} ${value}`,
    );
  }
  if (counter.size === 0) {
    lines.push(
      `legacy_bff_requests_total{route="none",method="none",status="none",role="none",environment="${envName()}",caller="scrape"} 0`,
    );
  }
  return lines.join("\n") + "\n";
}

/** Snapshot for tests / admin ops JSON */
export function snapshotLegacyBffMetrics(): Array<
  LegacyBffMetricLabels & { count: number }
> {
  const out: Array<LegacyBffMetricLabels & { count: number }> = [];
  for (const [key, count] of counter.entries()) {
    const [route, method, status, role, environment, caller] = key.split("|");
    out.push({ route, method, status, role, environment, caller, count });
  }
  return out;
}

/** Test helper */
export function __resetLegacyBffMetricsForTests(): void {
  counter.clear();
}
