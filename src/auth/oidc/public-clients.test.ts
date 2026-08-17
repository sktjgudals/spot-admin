import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOPA_GOOGLE_WEB_CLIENT_ID,
  publicAppleClientId,
  publicGoogleClientId,
} from "./public-clients";

describe("admin public OIDC clients", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reuses the Flutter web Google client when env is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    expect(publicGoogleClientId()).toBe(DOPA_GOOGLE_WEB_CLIENT_ID);
  });

  it("hides Apple until a Services ID is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APPLE_CLIENT_ID", "");
    expect(publicAppleClientId()).toBe("");
  });
});
