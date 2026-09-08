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

  it("keeps the user detail route under the 사용자 menu", () => {
    expect(adminRouteLabel("/super-admin/users")).toBe("사용자");
    expect(adminRouteLabel("/super-admin/users/user-1")).toBe("사용자");
  });
});

