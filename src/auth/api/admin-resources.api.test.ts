import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({ adminFetchJson: vi.fn() }));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  listAdminResources,
  mutateAdminResource,
} from "@/auth/api/admin-resources.api";

describe("admin-resources.api", () => {
  beforeEach(() => vi.mocked(adminFetchJson).mockReset());

  it("uses the cursor envelope and encoded list filters", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({
      items: [],
      nextCursor: null,
      asOf: "2026-08-15T00:00:00.000Z",
    });
    const result = await listAdminResources("users", {
      q: "민 정",
      status: "ACTIVE",
      limit: 25,
    });
    expect(result.items).toEqual([]);
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/users?q=%EB%AF%BC+%EC%A0%95&status=ACTIVE&limit=25",
    );
  });

  it("sends audited mutation payloads to admin v2", async () => {
    vi.mocked(adminFetchJson).mockResolvedValue({ id: "usr-1", auditId: "audit-1" });
    await mutateAdminResource("/admin/v2/users/usr-1", "PATCH", {
      status: "SUSPENDED",
    });
    expect(adminFetchJson).toHaveBeenCalledWith("/admin/v2/users/usr-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
  });
});
