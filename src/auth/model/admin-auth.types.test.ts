import { describe, expect, it } from "vitest";
import {
  normalizeAdminWebRole,
  toAdminProfile,
} from "@/auth/model/admin-auth.types";
import { homePathForRole } from "@/auth/model/admin-routes";

describe("admin-auth.types", () => {
  it("normalizes legacy roles to BUSINESS_ADMIN", () => {
    expect(normalizeAdminWebRole("BUSINESS_ADMIN")).toBe("BUSINESS_ADMIN");
    expect(normalizeAdminWebRole("BUSINESS")).toBe("BUSINESS_ADMIN");
    expect(normalizeAdminWebRole("PARTNER_ADMIN")).toBe("BUSINESS_ADMIN");
    expect(normalizeAdminWebRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    expect(normalizeAdminWebRole("OPERATOR")).toBeNull();
  });

  it("home paths by role", () => {
    expect(homePathForRole("SUPER_ADMIN")).toBe("/app/businesses");
    expect(homePathForRole("BUSINESS_ADMIN")).toBe("/app/parties");
  });

  it("maps me payload to profile", () => {
    const p = toAdminProfile({
      id: "1",
      email: "a@b.com",
      name: "A",
      role: "BUSINESS_ADMIN",
      status: "ACTIVE",
      businessId: "biz-1",
      business: {
        id: "biz-1",
        name: "Studio",
        status: "ACTIVE",
        deletedAt: null,
      },
    });
    expect(p?.role).toBe("BUSINESS_ADMIN");
    expect(p?.businessId).toBe("biz-1");
  });
});
