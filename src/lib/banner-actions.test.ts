import { describe, expect, it } from "vitest";
import {
  normalizeBannerActionType,
  resolveBannerActionFields,
} from "@/lib/banner-actions";

describe("normalizeBannerActionType", () => {
  it("parses known types", () => {
    expect(normalizeBannerActionType("deeplink")).toBe("DEEPLINK");
    expect(normalizeBannerActionType("WEB")).toBe("WEB");
    expect(normalizeBannerActionType("instagram")).toBe("INSTAGRAM");
  });

  it("maps aliases", () => {
    expect(normalizeBannerActionType("DEEP_LINK")).toBe("DEEPLINK");
    expect(normalizeBannerActionType("TEL")).toBe("PHONE");
    expect(normalizeBannerActionType("KAKAO")).toBe("CUSTOM");
  });

  it("rejects unknown", () => {
    expect(normalizeBannerActionType("FOO")).toBeNull();
    expect(normalizeBannerActionType("")).toBeNull();
    expect(normalizeBannerActionType(null)).toBeNull();
  });
});

describe("resolveBannerActionFields", () => {
  it("prefers actionType + actionValue", () => {
    expect(
      resolveBannerActionFields({
        actionType: "DEEPLINK",
        actionValue: "majormap://party/15",
      }),
    ).toEqual({
      actionType: "DEEPLINK",
      actionValue: "majormap://party/15",
      linkUrl: null,
    });
  });

  it("syncs linkUrl for WEB", () => {
    expect(
      resolveBannerActionFields({
        actionType: "WEB",
        actionValue: "https://majormap.net",
      }),
    ).toEqual({
      actionType: "WEB",
      actionValue: "https://majormap.net",
      linkUrl: "https://majormap.net",
    });
  });

  it("NONE clears destinations", () => {
    expect(
      resolveBannerActionFields({
        actionType: "NONE",
        actionValue: "https://x.com",
        linkUrl: "https://x.com",
      }),
    ).toEqual({
      actionType: "NONE",
      actionValue: null,
      linkUrl: null,
    });
  });

  it("legacy linkUrl only", () => {
    expect(
      resolveBannerActionFields({
        linkUrl: "https://dopa.ing",
      }),
    ).toEqual({
      actionType: null,
      actionValue: null,
      linkUrl: "https://dopa.ing",
    });
  });
});
