import { describe, expect, it } from "vitest";
import { optionalIntField } from "./optional-int";

describe("optionalIntField", () => {
  const quota = optionalIntField(0);
  const birthYear = optionalIntField(1950, 2015);

  it("keeps an empty gender quota unset instead of writing 0", () => {
    expect(quota.parse("")).toBeUndefined();
    expect(quota.parse(undefined)).toBeUndefined();
  });

  it("accepts an explicit zero quota and a positive limit", () => {
    expect(quota.parse(0)).toBe(0);
    expect(quota.parse("4")).toBe(4);
  });

  it("does not coerce a blank birth year into 0", () => {
    expect(birthYear.parse("")).toBeUndefined();
    expect(birthYear.parse("1998")).toBe(1998);
  });
});
