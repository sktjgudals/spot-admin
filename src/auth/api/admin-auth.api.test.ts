import { afterEach, describe, expect, it, vi } from "vitest";
import { loginWithOidc, loginWithPassword, refreshSession } from "./admin-auth.api";

const PRIMARY = "https://api.example.test";
const FALLBACK = "https://worker.example.test";

const admin = {
  id: "admin-1",
  email: "admin@example.test",
  name: "관리자",
  role: "SUPER_ADMIN",
  businessId: null,
  status: "ACTIVE",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin auth API origin failover", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("probes the emergency Worker origin before sending login credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", PRIMARY);
    vi.stubEnv("NEXT_PUBLIC_API_FALLBACK_URL", FALLBACK);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("primary unavailable"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "access",
          sessionId: "session",
          admin,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginWithPassword({
      email: "admin@example.test",
      password: "password",
    });

    expect(result.accessToken).toBe("access");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${PRIMARY}/health`,
      expect.objectContaining({ method: "GET", credentials: "omit" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${FALLBACK}/health`,
      expect.objectContaining({ method: "GET", credentials: "omit" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${FALLBACK}/auth/v2/admin/login`,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(window.localStorage.getItem("dopa-admin-api-origin")).toBe(FALLBACK);
  });

  it("sends the Google id token to oidc-login on the selected origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", PRIMARY);
    vi.stubEnv("NEXT_PUBLIC_API_FALLBACK_URL", FALLBACK);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "access",
          sessionId: "session",
          admin,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginWithOidc({
      provider: "GOOGLE",
      idToken: "google-id-token",
      rememberMe: true,
    });

    expect(result.accessToken).toBe("access");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${PRIMARY}/auth/v2/admin/oidc-login`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body).toMatchObject({
      provider: "GOOGLE",
      idToken: "google-id-token",
      rememberMe: true,
      platform: "web",
    });
  });

  it("keeps an HTTP authentication failure on the selected origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", PRIMARY);
    vi.stubEnv("NEXT_PUBLIC_API_FALLBACK_URL", FALLBACK);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loginWithPassword({
        email: "admin@example.test",
        password: "wrong",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the selected fallback origin for cookie refresh", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", PRIMARY);
    vi.stubEnv("NEXT_PUBLIC_API_FALLBACK_URL", FALLBACK);
    window.localStorage.setItem("dopa-admin-api-origin", FALLBACK);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "next-access",
          sessionId: "session",
          admin,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshSession();

    expect(result.accessToken).toBe("next-access");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${FALLBACK}/health`,
      expect.objectContaining({ credentials: "omit" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${FALLBACK}/auth/v2/admin/refresh`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns a retryable network error only when every origin is unreachable", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", PRIMARY);
    vi.stubEnv("NEXT_PUBLIC_API_FALLBACK_URL", FALLBACK);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("primary unavailable"))
        .mockRejectedValueOnce(new TypeError("fallback unavailable")),
    );

    await expect(
      loginWithPassword({
        email: "admin@example.test",
        password: "password",
      }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      permanent: false,
    });
  });
});
