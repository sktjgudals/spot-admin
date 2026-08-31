import { describe, expect, it } from "vitest";
import { adminRouteLabel } from "./AdminSidebar";

describe("adminRouteLabel", () => {
  it("labels analytics and nested operations routes", () => {
    expect(adminRouteLabel("/super-admin/analytics")).toBe("제품 분석");
    expect(adminRouteLabel("/app/businesses/business-1/parties")).toBe("업체 · 파티 · 초대");
  });

  it("falls back without exposing a raw pathname", () => {
    expect(adminRouteLabel("/unmapped")).toBe("운영 콘솔");
  });
});

