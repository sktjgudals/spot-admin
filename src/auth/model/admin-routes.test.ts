import { describe, expect, it } from "vitest";
import {
  businessPartiesPath,
  homePathForRole,
  AdminApi,
  resolveBusinessScope,
} from "@/auth/model/admin-routes";

describe("admin-routes scope contract", () => {
  it("SUPER_ADMIN home is super-admin dashboard", () => {
    expect(homePathForRole("SUPER_ADMIN")).toBe("/super-admin/dashboard");
  });

  it("BUSINESS_ADMIN home is the Auth v2 mobile party list", () => {
    expect(homePathForRole("BUSINESS_ADMIN")).toBe("/app/parties");
  });

  it("SUPER_ADMIN party URL embeds businessId", () => {
    expect(businessPartiesPath("biz_abc")).toBe(
      "/app/businesses/biz_abc/parties",
    );
    expect(AdminApi.parties("biz_abc")).toBe(
      "/admin/v2/businesses/biz_abc/parties",
    );
  });

  it("business operator assignment has explicit SUPER_ADMIN routes", () => {
    expect(AdminApi.businessOperatorCandidates()).toBe(
      "/admin/v2/business-operator-candidates",
    );
    expect(AdminApi.businessOperators("biz-1")).toBe(
      "/admin/v2/businesses/biz-1/operators",
    );
  });

  it("BUSINESS_ADMIN always uses profile businessId", () => {
    expect(
      resolveBusinessScope({
        role: "BUSINESS_ADMIN",
        profileBusinessId: "biz-mine",
        routeBusinessId: "biz-other",
      }),
    ).toEqual({ error: "CROSS_TENANT_BLOCKED" });

    expect(
      resolveBusinessScope({
        role: "BUSINESS_ADMIN",
        profileBusinessId: "biz-mine",
      }),
    ).toEqual({ businessId: "biz-mine" });
  });

  it("SUPER_ADMIN requires route businessId for scoped APIs", () => {
    expect(
      resolveBusinessScope({
        role: "SUPER_ADMIN",
        profileBusinessId: null,
        routeBusinessId: null,
      }),
    ).toEqual({ error: "MISSING_BUSINESS_SCOPE" });

    expect(
      resolveBusinessScope({
        role: "SUPER_ADMIN",
        profileBusinessId: null,
        routeBusinessId: "biz-1",
      }),
    ).toEqual({ businessId: "biz-1" });
  });

  it("cross-tenant: BUSINESS_ADMIN cannot use foreign route businessId", () => {
    const r = resolveBusinessScope({
      role: "BUSINESS_ADMIN",
      profileBusinessId: "biz-a",
      routeBusinessId: "biz-b",
    });
    expect(r).toEqual({ error: "CROSS_TENANT_BLOCKED" });
  });
});
