import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetLegacyBffMetricsForTests,
  normalizeLegacyBffRoute,
  recordLegacyBffRequest,
  renderLegacyBffMetrics,
  snapshotLegacyBffMetrics,
} from "@/lib/legacy-bff-metrics";

describe("legacy-bff-metrics", () => {
  beforeEach(() => {
    __resetLegacyBffMetricsForTests();
  });

  it("normalizes dynamic ids out of paths", () => {
    expect(
      normalizeLegacyBffRoute(
        "/api/super-admin/businesses/clxxxxxxxxxxxxxxxxxxxx/invite",
      ),
    ).toBe("super_admin_businesses_id_invite");
    expect(
      normalizeLegacyBffRoute(
        "/api/business/parties/550e8400-e29b-41d4-a716-446655440000/close",
      ),
    ).toBe("business_parties_id_close");
  });

  it("increments counters without PII labels", () => {
    recordLegacyBffRequest({
      route: "super_admin_businesses",
      method: "GET",
      status: "ok",
      role: "SUPER_ADMIN",
      caller: "bff",
    });
    recordLegacyBffRequest({
      route: "super_admin_businesses",
      method: "GET",
      status: "ok",
      role: "SUPER_ADMIN",
      caller: "bff",
    });
    const snap = snapshotLegacyBffMetrics();
    expect(snap).toHaveLength(1);
    expect(snap[0].count).toBe(2);
    const text = renderLegacyBffMetrics();
    expect(text).toContain("legacy_bff_requests_total");
    expect(text).toContain('route="super_admin_businesses"');
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("@");
  });
});
