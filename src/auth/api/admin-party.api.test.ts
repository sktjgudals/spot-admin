import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  createParty,
  getParty,
  listParties,
  softCloseParty,
  updateParty,
} from "@/auth/api/admin-party.api";

describe("admin-party.api", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
  });

  it("listParties uses business-scoped path", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue([]);
    await listParties("biz-1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz-1/parties",
    );
  });

  it("createParty posts under business", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "p1" });
    await createParty("biz-1", {
      title: "T",
      description: "D",
      date: "2030-01-01T12:00:00.000Z",
      location: "Seoul",
      maxCapacity: 10,
    });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz-1/parties",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("get/update/softClose use party id path", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "p1" });
    await getParty("p1");
    expect(adminFetchJson).toHaveBeenCalledWith("/admin/v2/parties/p1");
    await updateParty("p1", { title: "X" });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/parties/p1",
      expect.objectContaining({ method: "PATCH" }),
    );
    await softCloseParty("p1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/parties/p1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
