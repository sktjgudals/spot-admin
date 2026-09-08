import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_DIMENSION,
  ANALYTICS_PLATFORMS,
  EMPTY_FILTERS,
  activeFilterCount,
  availablePlatforms,
  buildDimensionFilter,
  filtersKey,
  normalizePlatform,
  togglePlatform,
} from "./analytics-filters";

describe("filter identity", () => {
  it("keys the same selection identically regardless of click order", () => {
    const a = { platforms: ["Android", "iOS"] as const, accountType: "all" as const };
    const b = { platforms: ["iOS", "Android"] as const, accountType: "all" as const };

    expect(filtersKey(a)).toBe(filtersKey(b));
    expect(filtersKey(EMPTY_FILTERS)).toBe("|all");
    expect(filtersKey({ platforms: ["web"], accountType: "business" })).toBe(
      "web|business",
    );
  });

  it("counts each active constraint once", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ platforms: ["iOS"], accountType: "all" })).toBe(1);
    expect(
      activeFilterCount({ platforms: ["iOS", "web"], accountType: "business" }),
    ).toBe(3);
  });

  it("toggles a platform without disturbing the canonical order", () => {
    const withWeb = togglePlatform(EMPTY_FILTERS, "web");
    const withBoth = togglePlatform(withWeb, "iOS");

    expect(withBoth.platforms).toEqual(["iOS", "web"]);
    expect(togglePlatform(withBoth, "web").platforms).toEqual(["iOS"]);
  });
});

describe("buildDimensionFilter", () => {
  it("sends nothing when nothing is selected", () => {
    expect(buildDimensionFilter(EMPTY_FILTERS)).toBeUndefined();
  });

  it("sends a bare filter for one constraint and an andGroup for two", () => {
    expect(
      buildDimensionFilter({ platforms: ["iOS", "Android"], accountType: "all" }),
    ).toEqual({
      filter: {
        fieldName: "platform",
        inListFilter: { values: ["iOS", "Android"] },
      },
    });

    expect(
      buildDimensionFilter({ platforms: [], accountType: "business" }),
    ).toEqual({
      filter: {
        fieldName: ACCOUNT_TYPE_DIMENSION,
        stringFilter: { matchType: "EXACT", value: "business" },
      },
    });

    expect(
      buildDimensionFilter({ platforms: ["web"], accountType: "consumer" }),
    ).toEqual({
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "platform",
              inListFilter: { values: ["web"] },
            },
          },
          {
            filter: {
              fieldName: ACCOUNT_TYPE_DIMENSION,
              stringFilter: { matchType: "EXACT", value: "consumer" },
            },
          },
        ],
      },
    });
  });

  it("omits caseSensitive so an unexpected platform casing still matches", () => {
    const expression = buildDimensionFilter({
      platforms: ["web"],
      accountType: "all",
    });

    expect(JSON.stringify(expression)).not.toContain("caseSensitive");
  });
});

describe("availablePlatforms", () => {
  it("offers the chips only where more than one platform can appear", () => {
    expect(availablePlatforms("mixed")).toEqual(ANALYTICS_PLATFORMS);
    expect(availablePlatforms("web")).toEqual([]);
    expect(availablePlatforms("ios")).toEqual([]);
    expect(availablePlatforms("android")).toEqual([]);
  });
});

describe("normalizePlatform", () => {
  it("maps GA4's casing onto the canonical labels and passes anything else through", () => {
    expect(normalizePlatform("ios")).toBe("iOS");
    expect(normalizePlatform("ANDROID")).toBe("Android");
    expect(normalizePlatform("Web")).toBe("web");
    expect(normalizePlatform("(not set)")).toBe("(not set)");
  });
});
