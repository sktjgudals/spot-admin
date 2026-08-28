import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-api-origin", () => ({
  getAdminApiBaseUrl: () => "https://api.example.test",
}));

vi.mock("@/auth/refresh/refresh-single-flight", () => ({
  refreshAccessToken: vi.fn(),
}));

import { refreshAccessToken } from "@/auth/refresh/refresh-single-flight";
import {
  __resetAccessTokenForTests,
  setAccessToken,
} from "@/auth/store/admin-auth.store";
import { adminFetchJson } from "./admin-http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("adminFetch", () => {
  afterEach(() => {
    __resetAccessTokenForTests();
    vi.unstubAllGlobals();
    vi.mocked(refreshAccessToken).mockReset();
  });

  it("refreshes once and retries after a 401", async () => {
    setAccessToken("old-token");
    vi.mocked(refreshAccessToken).mockResolvedValue("new-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminFetchJson<{ ok: boolean }>("/admin/v2/businesses");

    expect(result).toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.headers.get("Authorization")).toBe(
      "Bearer new-token",
    );
  });

  it("does not refresh login requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "bad" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      adminFetchJson("/auth/v2/admin/login", {
        method: "POST",
        body: JSON.stringify({}),
        skipAuthRefresh: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets the browser add a multipart boundary for FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ queued: true }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("subject", "테스트");

    await adminFetchJson("/admin/v2/mail/messages", { method: "POST", body: form });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has("Content-Type")).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(form);
  });

  it("reads the existing errorCode envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse({ errorCode: "RATE_LIMITED", message: "잠시 후 다시 시도" }, 429),
      ),
    );

    await expect(adminFetchJson("/admin/v2/mail/messages")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });
});
