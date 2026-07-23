import { NextResponse } from "next/server";
import {
  renderLegacyBffMetrics,
  snapshotLegacyBffMetrics,
} from "@/lib/legacy-bff-metrics";

/**
 * Prometheus scrape / ops dump for residual legacy BFF traffic.
 *
 * Security: optional shared key (LEGACY_BFF_METRICS_TOKEN).
 * Never embeds tokens, cookies, or PII — counters only.
 *
 * GET /api/metrics/legacy-bff
 * GET /api/metrics/legacy-bff?format=json
 */
export async function GET(req: Request) {
  const token = process.env.LEGACY_BFF_METRICS_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization") ?? "";
    const q = new URL(req.url).searchParams.get("token");
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (bearer !== token && q !== token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({
      metric: "legacy_bff_requests_total",
      series: snapshotLegacyBffMetrics(),
    });
  }

  return new NextResponse(renderLegacyBffMetrics(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
