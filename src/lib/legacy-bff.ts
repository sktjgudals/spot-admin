/**
 * Shared metadata for Next.js `/api/**` BFF routes that still exist after Auth v2 cutover.
 *
 * @see docs/LEGACY_BFF_INVENTORY.md
 */

import {
  recordLegacyBffRequest,
  routeKeyFromHeaders,
} from "@/lib/legacy-bff-metrics";

export const LEGACY_BFF_OWNER = "Admin Platform";

/** Default calendar removal if feature row does not override */
export const LEGACY_BFF_DEFAULT_REMOVAL = "2026-10";

/**
 * Lifecycle for each BFF group (update in inventory as evidence lands):
 * ACTIVE → RESIDUAL → ZERO_TRAFFIC → READY_TO_DELETE → REMOVED
 */
export type LegacyBffLifecycle =
  | "ACTIVE"
  | "RESIDUAL"
  | "ZERO_TRAFFIC"
  | "READY_TO_DELETE"
  | "REMOVED";

/**
 * Paste / keep this block at the top of every legacy BFF route.ts:
 *
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: YYYY-MM
 * UI: legacy pages redirected; do not add new callers.
 */

const warned = new Set<string>();

/**
 * Non-prod: one console warn per route key.
 * All envs (incl. production): increment legacy_bff_requests_total (no PII).
 */
export function warnLegacyBffHit(
  routeKey: string,
  meta?: {
    method?: string;
    status?: string;
    role?: string;
    caller?: string;
  },
): void {
  recordLegacyBffRequest({
    route: routeKey,
    method: meta?.method ?? "UNKNOWN",
    status: meta?.status ?? "hit",
    role: meta?.role ?? "unknown",
    caller: meta?.caller ?? "bff",
  });

  if (process.env.NODE_ENV === "production") return;
  if (warned.has(routeKey)) return;
  warned.add(routeKey);
  // eslint-disable-next-line no-console
  console.warn(
    `[legacy-bff] hit ${routeKey} — prefer Nest /admin/v2 (see docs/LEGACY_BFF_INVENTORY.md)`,
  );
}

/** Record auth outcome for a BFF hit (used by requireRole). */
export async function trackLegacyBffAuth(meta: {
  method?: string;
  status: "ok" | "unauthorized" | "forbidden" | "error";
  role?: string;
  headerGetter: () => Promise<Headers> | Headers;
}): Promise<void> {
  const route = await routeKeyFromHeaders(
    meta.headerGetter,
    meta.method ?? "UNKNOWN",
  );
  warnLegacyBffHit(route, {
    method: meta.method,
    status: meta.status,
    role: meta.role ?? "anonymous",
    caller: "bff",
  });
}

/** JSDoc template for codegen / scripts */
export const LEGACY_BFF_FILE_HEADER = `/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: ${LEGACY_BFF_OWNER}
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: ${LEGACY_BFF_DEFAULT_REMOVAL}
 * UI: legacy pages redirected; do not add new callers.
 */
`;
