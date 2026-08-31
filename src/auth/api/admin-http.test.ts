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
  setAuthenticatedAdminSession,
  setAccessToken,
} from "@/auth/store/admin-auth.store";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
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

  it("never retries the original request after the session principal changes", async () => {
    setAccessToken("admin-a-token");
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new AdminAuthError(
        "SESSION_PRINCIPAL_CHANGED",
        "다른 관리자 세션이 감지되었습니다.",
        { status: 401, permanent: true },
      ),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      adminFetchJson("/admin/v2/businesses/me/parties"),
    ).rejects.toMatchObject({ code: "SESSION_PRINCIPAL_CHANGED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 401 when the session changes while refresh is in flight", async () => {
    let resolveRefresh!: (token: string) => void;
    vi.mocked(refreshAccessToken).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });

    const request = adminFetchJson("/businesses/me/parties");
    await vi.waitFor(() =>
      expect(refreshAccessToken).toHaveBeenCalledTimes(1),
    );
    setAuthenticatedAdminSession("admin-b-token", {
      id: "admin-b",
      role: "BUSINESS_ADMIN",
      businessId: "business-b",
    });
    resolveRefresh("admin-b-token");

    await expect(request).rejects.toMatchObject({
      code: "SESSION_CHANGED_DURING_REQUEST",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards an in-flight response after another administrator is adopted", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });

    let cacheWrite: { tenant: string } | undefined;
    const request = adminFetchJson<{ tenant: string }>(
      "/businesses/me/parties",
    ).then((result) => {
      cacheWrite = result;
      return result;
    });

    setAuthenticatedAdminSession("admin-b-token", {
      id: "admin-b",
      role: "BUSINESS_ADMIN",
      businessId: "business-b",
    });
    resolveResponse(jsonResponse({ tenant: "business-a" }));

    await expect(request).rejects.toMatchObject({
      code: "SESSION_CHANGED_DURING_REQUEST",
      permanent: true,
    });
    expect(cacheWrite).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards a response when the session changes during body decoding", async () => {
    let resolveBody!: (body: { tenant: string }) => void;
    const response = jsonResponse({ ignored: true });
    vi.spyOn(response, "json").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBody = resolve;
        }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });

    const request = adminFetchJson<{ tenant: string }>(
      "/businesses/me/parties",
    );
    await vi.waitFor(() => expect(response.json).toHaveBeenCalledTimes(1));
    setAuthenticatedAdminSession("admin-b-token", {
      id: "admin-b",
      role: "BUSINESS_ADMIN",
      businessId: "business-b",
    });
    resolveBody({ tenant: "business-a" });

    await expect(request).rejects.toMatchObject({
      code: "SESSION_CHANGED_DURING_REQUEST",
    });
  });

  it("does not resolve an old bodyless mutation after a session replacement", async () => {
    setAuthenticatedAdminSession("admin-a-token", {
      id: "admin-a",
      role: "BUSINESS_ADMIN",
      businessId: "business-a",
    });
    const bodylessResponse = {
      status: 204,
      get ok() {
        setAuthenticatedAdminSession("admin-b-token", {
          id: "admin-b",
          role: "BUSINESS_ADMIN",
          businessId: "business-b",
        });
        return true;
      },
    } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bodylessResponse));

    await expect(
      adminFetchJson("/businesses/me/mutation", { method: "POST" }),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED_DURING_REQUEST" });
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
