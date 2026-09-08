import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

const fetchJson = vi.fn();
vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: (...args: unknown[]) => fetchJson(...args),
}));

const {
  getAdminUser,
  getAdminUserSummary,
  getAdminUserTimeline,
  isAdminForbidden,
  isAdminNotFound,
} = await import("./admin-users.api");

afterEach(() => {
  fetchJson.mockReset();
});

describe("getAdminUser", () => {
  it("encodes the id and fills every field a partial row omits", async () => {
    fetchJson.mockResolvedValue({ id: "u/1", nickname: "민정" });

    const user = await getAdminUser("u/1");

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u%2F1");
    expect(user).toEqual({
      id: "u/1",
      email: null,
      nickname: "민정",
      profileImage: null,
      provider: null,
      role: "USER",
      status: "ACTIVE",
      averageRating: null,
      createdAt: null,
      updatedAt: null,
      assignedBusinessId: null,
      blocked: false,
      asOf: null,
      summary: null,
    });
  });

  it("adopts an inline summary so the detail route alone can render the page", async () => {
    fetchJson.mockResolvedValue({
      id: "u1",
      nickname: "민정",
      status: "SUSPENDED",
      blocked: true,
      summary: {
        profile: { id: "u1", nickname: "민정", lastSeenAt: "2026-09-07T10:00:00.000Z" },
        devices: {
          activeSessionCount: 2,
          sessions: [{ id: "s1", platform: "ios", appVersion: "1.0.5" }],
          pushTokens: [{ id: "p1", platform: "ios", appVersion: "1.0.5" }],
        },
        counts: {
          applications: { APPROVED: 3, PENDING: "nope" },
          payments: { count: 4, paidCount: 3, paidAmount: 90000, businessCount: 2 },
          refunds: { count: 1, completedAmount: 20000 },
          reportsFiled: 1,
          reportsReceived: { total: 2, pending: 1 },
          activeRestrictions: [{ id: "r1", kind: "DM_BLOCK" }],
        },
        consent: { termsVersion: "v3", agreedAt: "2026-01-02T00:00:00.000Z", marketingOptIn: true },
        asOf: "2026-09-08T00:00:00.000Z",
      },
    });

    const user = await getAdminUser("u1");

    expect(user.blocked).toBe(true);
    expect(user.status).toBe("SUSPENDED");
    expect(user.asOf).toBe("2026-09-08T00:00:00.000Z");
    expect(user.summary?.profile.lastSeenAt).toBe("2026-09-07T10:00:00.000Z");
    expect(user.summary?.devices.pushTokens[0]?.appVersion).toBe("1.0.5");
    expect(user.summary?.counts.applications).toEqual({ APPROVED: 3 });
    expect(user.summary?.counts.payments.paidAmount).toBe(90000);
    expect(user.summary?.counts.activeRestrictions[0]).toEqual({
      id: "r1",
      kind: "DM_BLOCK",
      reasonCode: null,
      startsAt: null,
      endsAt: null,
      issuedBy: null,
    });
    expect(user.summary?.consent?.marketingOptIn).toBe(true);
  });
});

describe("getAdminUserSummary", () => {
  it("reads the dedicated route and normalizes a sparse payload", async () => {
    fetchJson.mockResolvedValue({ asOf: "2026-09-08T00:00:00.000Z" });

    const summary = await getAdminUserSummary("u1");

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u1/summary");
    expect(summary).toEqual({
      profile: {
        id: "",
        nickname: "이름 없음",
        email: null,
        profileImage: null,
        status: "ACTIVE",
        createdAt: null,
        lastSeenAt: null,
        deletedAt: null,
      },
      devices: { activeSessionCount: 0, sessions: [], pushTokens: [] },
      counts: {
        applications: {},
        payments: { count: 0, paidCount: 0, paidAmount: 0, businessCount: 0 },
        refunds: { count: 0, completedAmount: 0 },
        reportsFiled: 0,
        reportsReceived: { total: 0, pending: 0 },
        activeRestrictions: [],
      },
      consent: null,
      asOf: "2026-09-08T00:00:00.000Z",
    });
  });

  it("returns null when the summary route reports 404 instead of failing the page", async () => {
    fetchJson.mockRejectedValue(
      new AdminAuthError("NOT_FOUND", "no user", { status: 404 }),
    );

    await expect(getAdminUserSummary("u1")).resolves.toBeNull();
  });

  it("rethrows every other failure", async () => {
    fetchJson.mockRejectedValue(
      new AdminAuthError("FORBIDDEN", "nope", { status: 403 }),
    );

    await expect(getAdminUserSummary("u1")).rejects.toBeInstanceOf(AdminAuthError);
  });
});

describe("getAdminUserTimeline", () => {
  it("defaults to a 20-row page and sends no filters", async () => {
    fetchJson.mockResolvedValue({ items: [], nextCursor: null });

    await getAdminUserTimeline("u1");

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u1/timeline?limit=20");
  });

  it("joins kinds and categories with commas and passes the cursor verbatim", async () => {
    fetchJson.mockResolvedValue({ items: [], nextCursor: null });

    await getAdminUserTimeline("u1", {
      kinds: ["USER_SIGNUP", "SESSION_CREATED"],
      categories: ["ACCOUNT"],
      from: "2026-06-01T00:00:00.000Z",
      cursor: "abc==",
      limit: 20,
    });

    // URLSearchParams percent-encodes "," and ":"; the cursor is never parsed.
    expect(fetchJson).toHaveBeenCalledWith(
      "/admin/v2/users/u1/timeline?kinds=USER_SIGNUP%2CSESSION_CREATED&categories=ACCOUNT&from=2026-06-01T00%3A00%3A00.000Z&cursor=abc%3D%3D&limit=20",
    );
  });

  it("omits empty filter arrays", async () => {
    fetchJson.mockResolvedValue({ items: [], nextCursor: null });

    await getAdminUserTimeline("u1", { kinds: [], categories: [] });

    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/users/u1/timeline?limit=20");
  });

  it("normalizes rows, refs and coverage, tolerating a non-array coverage", async () => {
    fetchJson.mockResolvedValue({
      user: { id: "u1", nickname: "민정", status: "ACTIVE" },
      items: [
        {
          id: "e1",
          at: "2026-09-08T02:00:00.000Z",
          kind: "PAYMENT_PAID",
          category: "PAYMENT",
          title: "결제 완료",
          amount: 20000,
          refs: { paymentId: "pay-1", partyId: "party-1", businessId: "", extra: "drop" },
          source: "db",
        },
        { at: "2026-09-08T01:00:00.000Z" },
      ],
      nextCursor: "cursor-2",
      asOf: "2026-09-08T03:00:00.000Z",
      coverage: {},
    });

    const page = await getAdminUserTimeline("u1");

    expect(page.user).toEqual({
      id: "u1",
      nickname: "민정",
      status: "ACTIVE",
      deletedAt: null,
    });
    expect(page.items[0]).toEqual({
      id: "e1",
      at: "2026-09-08T02:00:00.000Z",
      kind: "PAYMENT_PAID",
      category: "PAYMENT",
      title: "결제 완료",
      detail: null,
      refs: { paymentId: "pay-1", partyId: "party-1" },
      status: null,
      amount: 20000,
      meta: {},
      source: "db",
    });
    expect(page.items[1]?.id).toBe("UNKNOWN:2026-09-08T01:00:00.000Z:1");
    expect(page.items[1]?.category).toBe("ACCOUNT");
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.coverage).toEqual([]);
  });

  it("keeps only coverage entries that carry an operator-readable note", async () => {
    fetchJson.mockResolvedValue({
      items: [],
      nextCursor: null,
      coverage: [
        { category: "SESSION", source: "audit", retainedFrom: "2026-06-01T00:00:00.000Z", note: "접속 기록은 90일만 보관합니다." },
        { category: "PARTY" },
      ],
    });

    const page = await getAdminUserTimeline("u1");

    expect(page.coverage).toEqual([
      {
        category: "SESSION",
        source: "audit",
        retainedFrom: "2026-06-01T00:00:00.000Z",
        note: "접속 기록은 90일만 보관합니다.",
      },
    ]);
  });
});

describe("error predicates", () => {
  it("recognizes 404 and 403 admin failures and nothing else", () => {
    expect(isAdminNotFound(new AdminAuthError("NOT_FOUND", "x", { status: 404 }))).toBe(true);
    expect(isAdminNotFound(new AdminAuthError("HTTP_ERROR", "x", { status: 500 }))).toBe(false);
    expect(isAdminNotFound(new Error("404"))).toBe(false);
    expect(isAdminForbidden(new AdminAuthError("FORBIDDEN", "x", { status: 403 }))).toBe(true);
    expect(isAdminForbidden(new AdminAuthError("NOT_FOUND", "x", { status: 404 }))).toBe(false);
  });
});
