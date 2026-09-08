import { describe, expect, it } from "vitest";
import type { UserTimelineItem } from "@/auth/api/admin-users.api";
import {
  TIMELINE_CATEGORIES,
  coverageSummaryText,
  filterTimelineItems,
  groupTimelineByDay,
  kindsForCategories,
  timelineFromIso,
  timelineKindLabel,
  timelineRefHref,
  timelineRefsOf,
} from "./user-timeline-model";

function item(overrides: Partial<UserTimelineItem>): UserTimelineItem {
  return {
    id: "e1",
    at: "2026-09-08T02:00:00.000Z",
    kind: "PAYMENT_APPROVED",
    category: "PAYMENT",
    title: "결제 완료",
    detail: null,
    refs: {},
    status: null,
    amount: null,
    meta: {},
    source: "db",
    ...overrides,
  };
}

describe("groupTimelineByDay", () => {
  it("splits at Seoul midnight, not UTC midnight", () => {
    const groups = groupTimelineByDay([
      item({ id: "a", at: "2026-09-07T15:01:00.000Z" }), // 00:01 KST on 9/8
      item({ id: "b", at: "2026-09-07T14:59:00.000Z" }), // 23:59 KST on 9/7
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.day).toBe("2026-09-08");
    expect(groups[0]?.label).toContain("8");
    expect(groups[1]?.day).toBe("2026-09-07");
    expect(groups[1]?.items.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("keeps the server's newest-first order inside a day", () => {
    const groups = groupTimelineByDay([
      item({ id: "a", at: "2026-09-08T05:00:00.000Z" }),
      item({ id: "b", at: "2026-09-08T04:00:00.000Z" }),
      item({ id: "c", at: "2026-09-08T03:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a row whose timestamp cannot be read instead of dropping it", () => {
    const groups = groupTimelineByDay([item({ id: "a", at: "" })]);

    expect(groups[0]?.day).toBe("unknown");
    expect(groups[0]?.label).toBe("시각을 알 수 없는 활동");
  });
});

describe("kindsForCategories / filterTimelineItems", () => {
  it("sends no kind filter when nothing is selected", () => {
    expect(kindsForCategories([])).toBeUndefined();
    expect(filterTimelineItems([item({ id: "a" })], [])).toHaveLength(1);
  });

  it("expands a category into its backend kinds without duplicates", () => {
    const payment = TIMELINE_CATEGORIES.find((entry) => entry.value === "PAYMENT");
    const kinds = kindsForCategories(["PAYMENT", "PAYMENT"]);

    expect(kinds).toEqual([...(payment?.kinds ?? [])]);
    expect(new Set(kinds).size).toBe(kinds?.length);
  });

  it("filters on the server-supplied category so an unlisted kind is never hidden", () => {
    const rows = [
      item({ id: "a", category: "PAYMENT", kind: "PAYMENT_APPROVED" }),
      item({ id: "b", category: "PAYMENT", kind: "PAYMENT_SOMETHING_NEW" }),
      item({ id: "c", category: "SOCIAL", kind: "USER_FOLLOWED" }),
    ];

    expect(filterTimelineItems(rows, ["PAYMENT"]).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("timelineRefsOf / timelineRefHref", () => {
  it("links the references that have a destination and leaves the rest inert", () => {
    const refs = timelineRefsOf({
      userId: "u2",
      businessId: "biz-1",
      partyId: "party-1",
      paymentId: "pay-1",
      refundId: "ref-1",
      reportId: "rep-1",
      applicationId: "app-1",
      targetId: "t-1",
    });

    const hrefs = Object.fromEntries(
      refs.map((ref) => [ref.kind, timelineRefHref(ref)]),
    );

    expect(hrefs.user).toBe("/super-admin/users/u2");
    expect(hrefs.business).toBe("/app/businesses/biz-1");
    expect(hrefs.party).toBe("/app/businesses/biz-1/parties/party-1");
    expect(hrefs.payment).toBe("/super-admin/payments?payments_q=pay-1");
    expect(hrefs.refund).toBe("/super-admin/payments?refunds_q=ref-1");
    // Reports have no per-id URL, and an application or a moderation target
    // does not carry enough type information to guess one.
    expect(hrefs.report).toBeNull();
    expect(hrefs.application).toBeNull();
    expect(hrefs.target).toBeNull();
  });

  it("refuses to build a party link without the owning business", () => {
    const [party] = timelineRefsOf({ partyId: "party-1" });

    expect(party?.kind).toBe("party");
    expect(party ? timelineRefHref(party) : "unreachable").toBeNull();
  });

  it("returns nothing for a row with no references", () => {
    expect(timelineRefsOf(undefined)).toEqual([]);
    expect(timelineRefsOf({})).toEqual([]);
  });
});

describe("timelineFromIso", () => {
  it("turns a period into an absolute start and leaves 전체 unbounded", () => {
    const now = Date.parse("2026-09-08T00:00:00.000Z");

    expect(timelineFromIso("7d", now)).toBe("2026-09-01T00:00:00.000Z");
    expect(timelineFromIso("28d", now)).toBe("2026-08-11T00:00:00.000Z");
    expect(timelineFromIso("all", now)).toBeNull();
  });
});

describe("coverageSummaryText", () => {
  it("names the window and the categories the server actually covered", () => {
    const text = coverageSummaryText({
      from: "2026-08-11T00:00:00.000Z",
      asOf: "2026-09-08T00:00:00.000Z",
      coverage: [
        {
          category: "SESSION",
          source: "audit",
          retainedFrom: null,
          note: "접속 기록은 90일만 보관합니다.",
        },
        {
          category: "PAYMENT",
          source: "db",
          retainedFrom: null,
          note: "정산 확정 전 금액입니다.",
        },
      ],
      categories: [],
    });

    expect(text).toContain("기간의");
    expect(text).toContain("접속");
    expect(text).toContain("결제");
    expect(text).toMatch(/를 포함합니다$/);
  });

  it("falls back to the selected chips, then to every category", () => {
    const base = { from: null, asOf: null, coverage: [] };

    expect(coverageSummaryText({ ...base, categories: ["PARTY"] })).toContain("파티");
    expect(coverageSummaryText({ ...base, categories: [] })).toContain("계정");
    expect(coverageSummaryText({ ...base, categories: [] })).toContain("서비스 시작");
  });
});

describe("timelineKindLabel", () => {
  it("falls back to the raw kind so a new backend event is still readable", () => {
    expect(timelineKindLabel("PAYMENT_APPROVED")).toBe("결제 완료");
    expect(timelineKindLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
