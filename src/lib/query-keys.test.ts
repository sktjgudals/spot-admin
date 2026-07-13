import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("queryKeys", () => {
  it("목록 키는 안정적인 튜플이다", () => {
    expect(queryKeys.banners).toEqual(["banners"]);
    expect(queryKeys.coupons).toEqual(["coupons"]);
    expect(queryKeys.chatMessages("room-1")).toEqual(["chatMessages", "room-1"]);
  });
});
