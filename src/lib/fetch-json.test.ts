import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/fetch-json";

describe("fetchJson", () => {
  it("성공 시 JSON을 파싱한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
    await expect(fetchJson<{ ok: boolean }>("/x")).resolves.toEqual({ ok: true });
  });

  it("실패 시 message를 Error로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "권한 없음" }), { status: 403 }),
      ),
    );
    await expect(fetchJson("/x")).rejects.toThrow("권한 없음");
  });
});
