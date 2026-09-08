import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InsightsPanel } from "./InsightsPanel";
import type { AnalyticsInsight } from "./types";

const insight = (
  overrides: Partial<AnalyticsInsight> & Pick<AnalyticsInsight, "id" | "severity" | "text">,
): AnalyticsInsight => ({
  metric: "activeUsers",
  scope: "total",
  delta: -32,
  current: 843,
  previous: 1240,
  ...overrides,
});

afterEach(cleanup);

describe("InsightsPanel", () => {
  it("labels severity in words, not colour alone", () => {
    render(
      <InsightsPanel
        insights={[
          insight({
            id: "total:newUsers",
            severity: "warning",
            text: "신규 사용자 32% 감소 (1,240 → 843)",
          }),
          insight({ id: "total:sessions", severity: "positive", text: "세션 33% 증가 (90 → 120)" }),
          insight({ id: "share:iOS", severity: "info", text: "iOS 비중 38% → 51%" }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "인사이트 요약" })).toBeInTheDocument();
    expect(screen.getByText("주의")).toBeInTheDocument();
    expect(screen.getByText("긍정")).toBeInTheDocument();
    expect(screen.getByText("참고")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("신규 사용자 32% 감소 (1,240 → 843)"),
    ).toBeInTheDocument();
  });

  it("says nothing moved rather than showing an empty list", () => {
    render(<InsightsPanel insights={[]} />);

    expect(
      screen.getByText("이전 기간 대비 눈에 띄는 변화가 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
