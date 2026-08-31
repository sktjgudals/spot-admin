import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots metadata", () => {
  it("keeps the private admin surface out of every crawler", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    });
  });
});
