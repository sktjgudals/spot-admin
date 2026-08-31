import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const supportedPlatforms = new Set([
  "web",
  "website",
  "ios",
  "android",
  "app",
  "mixed",
  "all",
]);

/**
 * Validates the public GA4 descriptors before a deploy build starts.
 * This deliberately mirrors the client parser without importing TypeScript
 * into the release script. Property identifiers are public configuration, not
 * credentials, but a missing value would ship a permanently disabled screen.
 */
export function requirePublicGa4Properties(raw = process.env.NEXT_PUBLIC_GA4_PROPERTIES) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(
      "NEXT_PUBLIC_GA4_PROPERTIES is required for an admin deployment build.",
    );
  }

  let properties;
  try {
    properties = JSON.parse(raw);
  } catch {
    throw new Error("NEXT_PUBLIC_GA4_PROPERTIES must be valid JSON.");
  }

  if (!Array.isArray(properties) || properties.length < 1 || properties.length > 20) {
    throw new Error("NEXT_PUBLIC_GA4_PROPERTIES must contain 1 to 20 properties.");
  }

  const seen = new Set();
  for (const property of properties) {
    if (typeof property !== "object" || property === null || Array.isArray(property)) {
      throw new Error("Each GA4 property must be an object.");
    }
    const id = String(property.id ?? "").trim().replace(/^properties\//, "");
    if (!/^\d+$/.test(id)) {
      throw new Error("Each GA4 property id must contain digits only.");
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate GA4 property id: ${id}`);
    }
    if (
      typeof property.label !== "string" ||
      property.label.trim().length < 1 ||
      property.label.trim().length > 80
    ) {
      throw new Error("Each GA4 property label must contain 1 to 80 characters.");
    }
    if (
      typeof property.platform !== "string" ||
      !supportedPlatforms.has(property.platform.trim().toLowerCase())
    ) {
      throw new Error("Each GA4 property platform must be supported by the dashboard.");
    }
    seen.add(id);
  }

  return raw;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  requirePublicGa4Properties();
}
