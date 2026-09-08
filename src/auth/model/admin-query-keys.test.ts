import { describe, expect, it } from "vitest";
import { adminQueryKeys } from "./admin-query-keys";

describe("adminQueryKeys", () => {
  it("keeps mail list queries under a dedicated cache prefix", () => {
    const params = { folder: "INBOX", unread: true };

    expect(adminQueryKeys.mail.list(params)).toEqual([
      ...adminQueryKeys.mail.lists,
      params,
    ]);
  });

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

  it("nests user summary and timeline under one detail key", () => {
    expect(adminQueryKeys.users.all).toEqual(["admin", "users"]);
    expect(adminQueryKeys.users.detail("u1")).toEqual([
      "admin",
      "users",
      "detail",
      "u1",
    ]);
    expect(adminQueryKeys.users.summary("u1")).toEqual([
      ...adminQueryKeys.users.detail("u1"),
      "summary",
    ]);
    expect(adminQueryKeys.users.timeline("u1")).toEqual([
      ...adminQueryKeys.users.detail("u1"),
      "timeline",
      {},
    ]);
    expect(adminQueryKeys.users.timeline("u1", { categories: "PARTY" })).toEqual([
      ...adminQueryKeys.users.detail("u1"),
      "timeline",
      { categories: "PARTY" },
    ]);
  });
});
