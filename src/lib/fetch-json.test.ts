import { describe, expect, it, vi } from "vitest";
import { bffFetch, fetchJson } from "@/lib/fetch-json";

vi.mock("@/auth/store/admin-auth.store", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/auth/refresh/refresh-single-flight", () => ({
  refreshAccessToken: vi.fn(async () => "refreshed-token"),
}));

describe("fetchJson / bffFetch", () => {
  it("성공 시 JSON을 파싱한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
    await expect(fetchJson<{ ok: boolean }>("/x")).resolves.toEqual({
      ok: true,
    });
  });

  it("Authorization Bearer를 붙인다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await bffFetch("/api/super-admin/banners");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("실패 시 message를 Error로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "권한 없음" }), {
          status: 403,
        }),
      ),
    );
    await expect(fetchJson("/x")).rejects.toThrow("권한 없음");
  });
});
