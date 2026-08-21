import { describe, expect, it } from "vitest";
import { adminQueryKeys } from "./admin-query-keys";

describe("adminQueryKeys", () => {
  it("uses one party list key for the operator scope", () => {
    expect(adminQueryKeys.parties.list("biz-1")).toEqual(
      adminQueryKeys.parties.list("biz-1", "business"),
    );
    expect(adminQueryKeys.parties.list("biz-1", "business")).not.toEqual(
      adminQueryKeys.parties.list("biz-1", "super"),
    );
  });

  it("keeps insight keys under the admin prefix", () => {
    expect(adminQueryKeys.insights()).toEqual(["admin", "insights", "all"]);
    expect(adminQueryKeys.insights("party-1")).toEqual([
      "admin",
      "insights",
      "party-1",
    ]);
  });
});
