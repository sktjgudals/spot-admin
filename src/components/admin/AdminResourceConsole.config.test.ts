import { describe, expect, it } from "vitest";
import { resourceConfigs } from "@/components/admin/AdminResourceConsole";

describe("business role request resource config", () => {
  it("connects the admin list and review actions to the backend contract", () => {
    const config = resourceConfigs["business-role-requests"];
    expect(config).toMatchObject({
      key: "business-role-requests",
      resource: "business-role-requests",
      title: "업체 권한 신청",
    });

    const pending = { id: "request-1", status: "PENDING" };
    expect(config.actions?.map((action) => action.label)).toEqual(["승인", "거절"]);
    expect(config.actions?.[0]?.path(pending)).toBe(
      "/admin/v2/business-role-requests/request-1/approve",
    );
    expect(config.actions?.[0]?.hidden?.(pending)).toBe(false);
    expect(config.actions?.[0]?.hidden?.({ ...pending, status: "APPROVED" })).toBe(true);
  });
});
