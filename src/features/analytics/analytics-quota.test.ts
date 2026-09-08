import { describe, expect, it } from "vitest";
import { QUOTA_POOL_LABELS, quotaPressure } from "./analytics-quota";
import type { AnalyticsQuotaState } from "./types";

function quota(
  entries: AnalyticsQuotaState["entries"],
  category: AnalyticsQuotaState["category"] = "core",
): AnalyticsQuotaState {
  return { category, entries };
}

describe("quotaPressure", () => {
  it("is ok when nothing is known or plenty remains", () => {
    expect(quotaPressure(null)).toEqual({
      level: "ok",
      scope: null,
      key: null,
      ratio: null,
    });
    expect(
      quotaPressure(
        quota([{ key: "tokensPerHour", consumed: 100, remaining: 39_900 }]),
      ).level,
    ).toBe("ok");
  });

  it("warns below a tenth of the hourly or daily pool", () => {
    expect(
      quotaPressure(
        quota([{ key: "tokensPerHour", consumed: 39_000, remaining: 1_000 }]),
      ),
    ).toEqual({ level: "low", scope: "hour", key: "tokensPerHour", ratio: 0.025 });

    expect(
      quotaPressure(
        quota([{ key: "tokensPerDay", consumed: 195_000, remaining: 5_000 }]),
      ).scope,
    ).toBe("day");
  });

  it("reports exhaustion and prefers the hourly pool when both are spent", () => {
    expect(
      quotaPressure(
        quota([
          { key: "tokensPerDay", consumed: 200_000, remaining: 0 },
          { key: "tokensPerHour", consumed: 40_000, remaining: 0 },
        ]),
      ),
    ).toEqual({ level: "exhausted", scope: "hour", key: "tokensPerHour", ratio: 0 });
  });

  it("ignores pools that are not token budgets", () => {
    expect(
      quotaPressure(
        quota([{ key: "concurrentRequests", consumed: 10, remaining: 0 }]),
      ).level,
    ).toBe("ok");
  });

  it("names each pool for the footer", () => {
    expect(QUOTA_POOL_LABELS).toEqual({
      core: "Core",
      realtime: "실시간",
      funnel: "퍼널(별도 풀)",
    });
  });
});
