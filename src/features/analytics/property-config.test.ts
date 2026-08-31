import { describe, expect, it } from "vitest";
import { parseAnalyticsProperties } from "./property-config";

describe("parseAnalyticsProperties", () => {
  it("parses and normalizes multiple public property descriptors", () => {
    const result = parseAnalyticsProperties(
      JSON.stringify([
        { id: "properties/1234", label: "Dopa Web", platform: "website" },
        { id: 5678, label: "Dopa App", platform: "app" },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      properties: [
        { id: "1234", label: "Dopa Web", platform: "web" },
        { id: "5678", label: "Dopa App", platform: "mixed" },
      ],
    });
  });

  it("rejects missing, malformed and duplicate property configuration", () => {
    expect(parseAnalyticsProperties(undefined).ok).toBe(false);
    expect(parseAnalyticsProperties("not-json").ok).toBe(false);
    expect(
      parseAnalyticsProperties(
        JSON.stringify([
          { id: "1234", label: "A", platform: "web" },
          { id: "properties/1234", label: "B", platform: "ios" },
        ]),
      ).ok,
    ).toBe(false);
  });

  it("rejects identifiers that could alter the Google API path", () => {
    const result = parseAnalyticsProperties(
      JSON.stringify([{ id: "1234:runReport", label: "Unsafe", platform: "web" }]),
    );

    expect(result).toMatchObject({ ok: false, properties: [] });
  });
});
