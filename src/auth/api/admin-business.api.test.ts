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
  listBusinessesPage,
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

  it("lists a bounded business page with server-side filters and cursor", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({
      items: [{ id: "b1" }],
      nextCursor: "next page",
      asOf: "2026-08-31T00:00:00.000Z",
    });
    const page = await listBusinessesPage({
      status: "ACTIVE",
      q: "도파 라운지",
      limit: 25,
      cursor: "current page",
    });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses?status=ACTIVE&q=%EB%8F%84%ED%8C%8C+%EB%9D%BC%EC%9A%B4%EC%A7%80&limit=25&cursor=current+page",
    );
    expect(page).toMatchObject({ nextCursor: "next page", asOf: "2026-08-31T00:00:00.000Z" });
    expect(page.items).toHaveLength(1);
  });

  it("getBusiness reads the projected resource without ineffective query flags", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "b1" });
    await getBusiness("b1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/businesses/b1",
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
    await searchBusinessAdminCandidates("민 정", {
      cursor: "next page",
      limit: 20,
    });
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/business-operator-candidates?q=%EB%AF%BC+%EC%A0%95&limit=20&cursor=next+page",
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
