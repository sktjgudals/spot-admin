import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  activateBusinessCommerce,
  assignBusinessAdmin,
  createBusiness,
  disableBusiness,
  getBusiness,
  getBusinessCommerce,
  listBusinesses,
  restoreBusiness,
  pauseBusinessCommerce,
  searchBusinessAdminCandidates,
  softDeleteBusiness,
  updateBusinessCommerce,
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

  it("searches existing users and assigns the selected business admin", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    await searchBusinessAdminCandidates("민 정");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/business-operator-candidates?q=%EB%AF%BC+%EC%A0%95&limit=20",
    );

    vi.mocked(adminFetchJson).mockResolvedValue({
      assignment: { userId: "u1" },
    });
    await assignBusinessAdmin("biz 1", "u1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/biz%201/operators",
      {
        method: "POST",
        body: JSON.stringify({ userId: "u1" }),
      },
    );
  });

  it("uses the commerce contract for read, draft, activate and pause", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ profile: null });

    await getBusinessCommerce("biz 1");
    expect(adminFetchJson).toHaveBeenLastCalledWith(
      "/admin/v2/businesses/biz%201/commerce",
    );

    const draft = {
      paymentMode: "TEST" as const,
      salesModel: "PAYOUT_AGENCY" as const,
      maxAmount: 29_000,
      salesUrl: "https://dopa.ing/parties/1",
      refundUrl: "https://dopa.ing/refunds",
    };
    await updateBusinessCommerce("biz 1", draft);
    expect(adminFetchJson).toHaveBeenLastCalledWith(
      "/admin/v2/businesses/biz%201/commerce",
      { method: "PUT", body: JSON.stringify(draft) },
    );

    await activateBusinessCommerce("biz 1");
    expect(adminFetchJson).toHaveBeenLastCalledWith(
      "/admin/v2/businesses/biz%201/commerce/activate",
      { method: "POST", body: JSON.stringify({}) },
    );

    await pauseBusinessCommerce("biz 1", "정산 계약 점검");
    expect(adminFetchJson).toHaveBeenLastCalledWith(
      "/admin/v2/businesses/biz%201/commerce/pause",
      {
        method: "POST",
        body: JSON.stringify({ reason: "정산 계약 점검" }),
      },
    );
  });
});
