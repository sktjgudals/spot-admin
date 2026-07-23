import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  createBusiness,
  disableBusiness,
  getBusiness,
  listBusinesses,
  restoreBusiness,
  softDeleteBusiness,
} from "@/auth/api/admin-business.api";

describe("admin-business.api", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
  });

  it("listBusinesses hits Nest list with includeDeleted", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue([]);
    await listBusinesses({ includeDeleted: true });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses?includeDeleted=true",
    );
  });

  it("getBusiness can include deleted", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "b1" });
    await getBusiness("b1", { includeDeleted: true });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/b1?includeDeleted=true",
    );
  });

  it("createBusiness posts body", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "b1", name: "A" });
    await createBusiness({ name: "A", kind: "COMPANY" });
    expect(adminFetchJson).toHaveBeenCalledWith("/admin/v2/businesses", {
      method: "POST",
      body: JSON.stringify({ name: "A", kind: "COMPANY" }),
    });
  });

  it("lifecycle actions use correct methods/paths", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "b1" });
    await disableBusiness("b1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/b1/disable",
      expect.objectContaining({ method: "POST" }),
    );
    await softDeleteBusiness("b1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/b1",
      expect.objectContaining({ method: "DELETE" }),
    );
    await restoreBusiness("b1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/b1/restore",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
