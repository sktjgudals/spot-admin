import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_READONLY_SCOPE,
  GoogleAnalyticsOAuthError,
  requestGoogleAnalyticsToken,
} from "./google-analytics-oauth";

describe("requestGoogleAnalyticsToken", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "google");
  });

  it("requests only analytics.readonly and validates the token response", async () => {
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn((config: Record<string, unknown>) => ({
      requestAccessToken: (overrides: Record<string, unknown>) => {
        requestAccessToken(overrides);
        const callback = config.callback as (response: Record<string, unknown>) => void;
        callback({
          access_token: "memory-only-token",
          expires_in: 3600,
          scope: ANALYTICS_READONLY_SCOPE,
          token_type: "Bearer",
        });
      },
    }));
    Object.defineProperty(window, "google", {
      configurable: true,
      value: { accounts: { oauth2: { initTokenClient } } },
    });

    const grant = await requestGoogleAnalyticsToken("public-client-id");

    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "public-client-id",
        scope: ANALYTICS_READONLY_SCOPE,
        include_granted_scopes: false,
      }),
    );
    expect(requestAccessToken).toHaveBeenCalledWith({
      prompt: "consent",
      scope: ANALYTICS_READONLY_SCOPE,
      include_granted_scopes: false,
    });
    expect(grant).toEqual({ accessToken: "memory-only-token", expiresInSeconds: 3600 });
  });

  it("rejects a response that did not grant analytics.readonly", async () => {
    Object.defineProperty(window, "google", {
      configurable: true,
      value: {
        accounts: {
          oauth2: {
            initTokenClient: (config: Record<string, unknown>) => ({
              requestAccessToken: () => {
                const callback = config.callback as (response: Record<string, unknown>) => void;
                callback({ access_token: "wrong-scope", expires_in: 3600, scope: "openid" });
              },
            }),
          },
        },
      },
    });

    await expect(requestGoogleAnalyticsToken("public-client-id")).rejects.toMatchObject({
      kind: "scope",
    });
  });

  it("maps a closed popup to an explicit cancellation error", async () => {
    Object.defineProperty(window, "google", {
      configurable: true,
      value: {
        accounts: {
          oauth2: {
            initTokenClient: (config: Record<string, unknown>) => ({
              requestAccessToken: () => {
                const errorCallback = config.error_callback as (error: { type: string }) => void;
                errorCallback({ type: "popup_closed" });
              },
            }),
          },
        },
      },
    });

    await expect(requestGoogleAnalyticsToken("public-client-id")).rejects.toEqual(
      expect.objectContaining<Partial<GoogleAnalyticsOAuthError>>({ kind: "cancelled" }),
    );
  });
});
