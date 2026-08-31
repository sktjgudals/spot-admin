import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  createParty,
  getParty,
  listOperatorPartyPage,
  listPartyCategories,
  listParties,
  transitionParty,
  updateParty,
} from "@/auth/api/admin-party.api";

describe("admin-party.api", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
  });

  it("listParties uses the authenticated operator scope", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue([]);
    await listParties("biz-1");
    expect(adminFetchJson).toHaveBeenCalledWith("/businesses/me/parties");
  });

  it("pages the operator list with the backend lifecycle and opaque cursor contract", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({
      items: [{ id: "party-2", title: "운영 파티" }],
      nextCursor: "opaque/cursor+2",
    });

    const result = await listOperatorPartyPage("biz-1", {
      lifecycle: "OPEN",
      limit: 50,
      cursor: "opaque/cursor+1",
    });

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/businesses/me/operator-parties?lifecycle=OPEN&limit=50&cursor=opaque%2Fcursor%2B1",
    );
    expect(result.nextCursor).toBe("opaque/cursor+2");
    expect(result.items[0]).toMatchObject({
      id: "party-2",
      title: "운영 파티",
      businessId: "biz-1",
    });
  });

  it("lists active party categories through the public catalog contract", async () => {
    const categories = [
      {
        id: "category-1",
        name: "솔로파티",
        status: "FIXED" as const,
        sortOrder: 1,
        iconUrl: null,
      },
    ];
    vi.mocked(adminFetchJson).mockResolvedValue({ categories });

    await expect(listPartyCategories()).resolves.toEqual(categories);
    expect(adminFetchJson).toHaveBeenCalledWith("/party-categories");
  });

  it("createParty posts under the authenticated operator business", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "p1" });
    await createParty("biz-1", {
      title: "T",
      description: "D",
      date: "2030-01-01T12:00:00.000Z",
      endsAt: "2030-01-01T15:00:00.000Z",
      location: "Seoul",
      maxCapacity: 10,
    });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/businesses/me/parties",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("get/update/transition use party id paths", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "p1" });
    await getParty("p1");
    expect(adminFetchJson).toHaveBeenCalledWith("/businesses/me/parties/p1");
    await updateParty("p1", { title: "X" });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/businesses/me/parties/p1",
      expect.objectContaining({ method: "PATCH" }),
    );
    await transitionParty("p1", {
      toStatus: "RECRUITING",
      expectedVersion: 0,
      idempotencyKey: "publish-p1",
    });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/parties/p1/transitions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(adminFetchJson).toHaveBeenLastCalledWith("/businesses/me/parties/p1");
  });

  it("encodes super-admin party ids", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "p/1", businessId: "biz-1" });
    await getParty("p/1", "super");
    expect(adminFetchJson).toHaveBeenCalledWith("/admin/v2/parties/p%2F1");
    await transitionParty(
      "p/1",
      {
        toStatus: "RECRUITING",
        expectedVersion: 0,
        idempotencyKey: "publish-p1",
      },
      "super",
    );
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/parties/p%2F1/transitions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
