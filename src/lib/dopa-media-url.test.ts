import { describe, expect, it } from "vitest";
import { dopaMediaUrl } from "./dopa-media-url";

describe("dopaMediaUrl", () => {
  it.each([
    "media.dopa.ing",
    "media-staging.dopa.ing",
    "media.test.dopa.ing",
  ])("builds an 80px avatar thumbnail for the trusted %s host", (host) => {
    expect(
      dopaMediaUrl(`https://${host}/profiles/user-1.jpg`, { width: 80 }),
    ).toBe(
      `https://${host}/t/width=80,quality=72,format=webp,fit=scale-down/profiles/user-1.jpg`,
    );
  });

  it.each([
    [1, 80],
    [120, 80],
    [121, 160],
    [282, 320],
    [1_600, 1_600],
    [2_000, 1_600],
  ])("snaps a requested width of %i to the backend width %i", (width, snapped) => {
    expect(
      dopaMediaUrl("https://media.dopa.ing/parties/cover.jpg", { width }),
    ).toBe(
      `https://media.dopa.ing/t/width=${snapped},quality=72,format=webp,fit=scale-down/parties/cover.jpg`,
    );
  });

  it.each([0, -1, 80.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "preserves the original URL for an invalid width of %s",
    (width) => {
      const original = "https://media.dopa.ing/profiles/user-1.jpg";

      expect(dopaMediaUrl(original, { width })).toBe(original);
    },
  );

  it.each([
    "http://media.dopa.ing/profiles/user-1.jpg",
    "https://media.dopa.ing.evil.test/profiles/user-1.jpg",
    "https://sub.media.dopa.ing/profiles/user-1.jpg",
    "https://user:password@media.dopa.ing/profiles/user-1.jpg",
    "https://media.dopa.ing:444/profiles/user-1.jpg",
    "//media.dopa.ing/profiles/user-1.jpg",
    "/profiles/user-1.jpg",
    "not a URL",
  ])("preserves an untrusted or invalid source URL: %s", (original) => {
    expect(dopaMediaUrl(original, { width: 80 })).toBe(original);
  });

  it.each([
    "https://media.dopa.ing/t/width=320,quality=72,format=webp,fit=scale-down/parties/cover.jpg",
    "https://media.dopa.ing/cdn-cgi/image/width=320/parties/cover.jpg",
  ])("does not nest an already transformed URL: %s", (original) => {
    expect(dopaMediaUrl(original, { width: 800 })).toBe(original);
  });

  it("preserves the original query and fragment on a transformed URL", () => {
    expect(
      dopaMediaUrl(
        "https://media.dopa.ing/parties/cover.jpg?version=2#preview",
        { width: 282 },
      ),
    ).toBe(
      "https://media.dopa.ing/t/width=320,quality=72,format=webp,fit=scale-down/parties/cover.jpg?version=2#preview",
    );
  });

  it("preserves a trusted origin that has no object path", () => {
    const original = "https://media.dopa.ing/";

    expect(dopaMediaUrl(original, { width: 80 })).toBe(original);
  });
});
