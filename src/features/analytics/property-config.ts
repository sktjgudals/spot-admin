import { z } from "zod/mini";
import type {
  AnalyticsPropertyConfig,
  AnalyticsPropertyPlatform,
} from "./types";

const propertySchema = z.object({
  id: z.union([z.string(), z.number()]),
  label: z.string().check(z.trim(), z.minLength(1), z.maxLength(80)),
  platform: z.string().check(z.trim(), z.minLength(1)),
});

const propertyListSchema = z
  .array(propertySchema)
  .check(z.minLength(1), z.maxLength(20));

export type AnalyticsPropertyParseResult =
  | { ok: true; properties: AnalyticsPropertyConfig[] }
  | { ok: false; properties: []; message: string };

const PLATFORM_ALIASES: Record<string, AnalyticsPropertyPlatform> = {
  web: "web",
  website: "web",
  ios: "ios",
  android: "android",
  app: "mixed",
  mixed: "mixed",
  all: "mixed",
};

/**
 * Parses the public, non-secret GA4 property descriptors injected at build time.
 * Property identifiers are normalized to digits so they cannot alter API paths.
 */
export function parseAnalyticsProperties(raw: string | undefined): AnalyticsPropertyParseResult {
  if (!raw?.trim()) {
    return {
      ok: false,
      properties: [],
      message: "GA4 속성이 설정되지 않았습니다.",
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      properties: [],
      message: "GA4 속성 설정이 올바른 JSON 배열이 아닙니다.",
    };
  }

  const parsed = propertyListSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      properties: [],
      message: "GA4 속성은 id, label, platform을 가진 배열이어야 합니다.",
    };
  }

  const seen = new Set<string>();
  const properties: AnalyticsPropertyConfig[] = [];
  for (const item of parsed.data) {
    const id = String(item.id).trim().replace(/^properties\//, "");
    if (!/^\d+$/.test(id)) {
      return {
        ok: false,
        properties: [],
        message: `GA4 속성 ID는 숫자여야 합니다: ${item.label}`,
      };
    }
    if (seen.has(id)) {
      return {
        ok: false,
        properties: [],
        message: `중복된 GA4 속성 ID가 있습니다: ${id}`,
      };
    }

    const platform = PLATFORM_ALIASES[item.platform.toLowerCase()];
    if (!platform) {
      return {
        ok: false,
        properties: [],
        message: `지원하지 않는 GA4 플랫폼입니다: ${item.platform}`,
      };
    }

    seen.add(id);
    properties.push({ id, label: item.label, platform });
  }

  return { ok: true, properties };
}
