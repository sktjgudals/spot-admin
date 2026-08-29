import { afterEach, describe, expect, it, vi } from "vitest";

const fetchJson = vi.fn();
vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: (...args: unknown[]) => fetchJson(...args),
}));

const {
  REASON_LABELS,
  RESOLUTION_LABELS,
  TARGET_KIND_LABELS,
  getAdminReport,
  listAdminReports,
  resolveAdminReport,
} = await import("./admin-reports.api");

afterEach(() => {
  fetchJson.mockReset();
});

describe("listAdminReports", () => {
  it("defaults to the open queue with an explicit limit", async () => {
    fetchJson.mockResolvedValue({ items: [] });
    await listAdminReports();
    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/reports?limit=50");
  });

  it("passes the status filter and offset through", async () => {
    fetchJson.mockResolvedValue({ items: [] });
    await listAdminReports({ status: "ACTIONED", offset: 50, limit: 25 });
    expect(fetchJson).toHaveBeenCalledWith(
      "/admin/v2/reports?status=ACTIONED&offset=50&limit=25",
    );
  });
});

describe("report detail and resolve", () => {
  it("encodes the report id into the path", async () => {
    fetchJson.mockResolvedValue({});
    await getAdminReport("rep/1");
    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/reports/rep%2F1");
  });

  it("posts the resolution as the request body", async () => {
    fetchJson.mockResolvedValue({});
    await resolveAdminReport("rep-1", {
      resolution: "USER_SUSPENDED",
      note: "재범",
    });
    expect(fetchJson).toHaveBeenCalledWith("/admin/v2/reports/rep-1/resolve", {
      method: "POST",
      body: JSON.stringify({ resolution: "USER_SUSPENDED", note: "재범" }),
    });
  });
});

describe("labels", () => {
  // The app sends codes; the queue is read by people. A code with no label
  // renders raw, which is survivable — a *wrong* label is not.
  it("covers every reason the app can send", () => {
    for (const code of [
      "HARASSMENT",
      "FAKE_PROFILE",
      "INAPPROPRIATE_CONTENT",
      "NO_SHOW",
      "SPAM",
      "OTHER",
    ]) {
      expect(REASON_LABELS[code]).toBeTruthy();
    }
  });

  it("covers every target kind the backend can store", () => {
    for (const kind of [
      "USER",
      "BUSINESS",
      "CONVERSATION",
      "MESSAGE",
      "REVIEW_POST",
      "PARTY",
    ]) {
      expect(TARGET_KIND_LABELS[kind]).toBeTruthy();
    }
  });

  it("covers every resolution the resolve endpoint accepts", () => {
    expect(Object.keys(RESOLUTION_LABELS).sort()).toEqual([
      "CONTENT_REMOVED",
      "DISMISSED",
      "USER_SUSPENDED",
    ]);
  });
});
