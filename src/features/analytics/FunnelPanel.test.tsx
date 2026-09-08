import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunnelPanel } from "./FunnelPanel";
import type { AnalyticsFunnelResult, AnalyticsFunnelStepResult } from "./types";

function step(
  index: number,
  name: string,
  users: number,
  shareOfFirst: number,
  rates: Partial<AnalyticsFunnelStepResult> = {},
): AnalyticsFunnelStepResult {
  return {
    index,
    name,
    users,
    completionRate: null,
    abandonments: null,
    abandonmentRate: null,
    shareOfFirst,
    ...rates,
  };
}

function result(overrides: Partial<AnalyticsFunnelResult> = {}): AnalyticsFunnelResult {
  return {
    view: "funnel",
    funnelId: "party-apply",
    title: "파티 신청",
    description: "파티 상세에서 신청 완료까지의 단계별 이탈입니다.",
    steps: [
      step(0, "파티 상세", 1000, 1, {
        completionRate: 0.4,
        abandonments: 600,
        abandonmentRate: 0.6,
      }),
      step(1, "신청 화면", 400, 0.4, {
        completionRate: 0.25,
        abandonments: 300,
        abandonmentRate: 0.75,
      }),
      step(2, "신청 완료", 100, 0.1),
    ],
    breakdown: null,
    currencyCode: "KRW",
    quota: null,
    dataQualityNotices: [],
    isEmpty: false,
    ...overrides,
  };
}

afterEach(cleanup);

function renderPanel(overrides: Partial<React.ComponentProps<typeof FunnelPanel>> = {}) {
  const onFunnelIdChange = vi.fn();
  const onBreakdownChange = vi.fn();
  render(
    <FunnelPanel
      result={result()}
      funnelId="party-apply"
      onFunnelIdChange={onFunnelIdChange}
      breakdown={false}
      onBreakdownChange={onBreakdownChange}
      {...overrides}
    />,
  );
  return { onFunnelIdChange, onBreakdownChange };
}

describe("FunnelPanel", () => {
  it("writes each step's conversion and abandonment as text beside the bar", () => {
    renderPanel();

    expect(screen.getByText("1. 파티 상세")).toBeInTheDocument();
    expect(screen.getByText("1,000명")).toBeInTheDocument();
    expect(screen.getByText(/다음 단계 전환 40\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/이탈 600명 \(60\.0%\)/)).toBeInTheDocument();
    // The last step has no next step, so it claims neither.
    expect(screen.getByText("마지막 단계")).toBeInTheDocument();
  });

  it("switches preset and breakdown through the controls", async () => {
    const user = userEvent.setup();
    const { onFunnelIdChange, onBreakdownChange } = renderPanel();

    await user.selectOptions(screen.getByLabelText("퍼널"), "party-payment");
    expect(onFunnelIdChange).toHaveBeenCalledWith("party-payment");

    await user.click(screen.getByLabelText("플랫폼별 보기"));
    expect(onBreakdownChange).toHaveBeenCalledWith(true);
  });

  it("lists every breakdown value under its step", () => {
    renderPanel({
      breakdown: true,
      result: result({
        breakdown: {
          dimension: "platform",
          rows: [
            {
              value: "iOS",
              steps: [
                step(0, "파티 상세", 600, 1, {
                  completionRate: 0.5,
                  abandonments: 300,
                  abandonmentRate: 0.5,
                }),
                step(1, "신청 화면", 300, 0.5),
                step(2, "신청 완료", 90, 0.15),
              ],
            },
            {
              value: "Android",
              steps: [
                step(0, "파티 상세", 400, 1),
                step(1, "신청 화면", 100, 0.25),
                step(2, "신청 완료", 10, 0.025),
              ],
            },
          ],
        },
      }),
    });

    expect(screen.getAllByText("iOS")).toHaveLength(3);
    expect(screen.getAllByText("Android")).toHaveLength(3);
    expect(screen.getByText("600명")).toBeInTheDocument();
  });

  it("blames the instrumentation, not the product, when step one is empty", () => {
    renderPanel({
      result: result({
        isEmpty: true,
        steps: [
          step(0, "파티 상세", 0, 0),
          step(1, "신청 화면", 0, 0),
          step(2, "신청 완료", 0, 0),
        ],
      }),
    });

    expect(
      screen.getByText(
        "선택한 기간에 퍼널 1단계 이벤트가 없습니다. 앱 이벤트 수집과 라우트 템플릿을 확인해 주세요.",
      ),
    ).toBeInTheDocument();
  });
});
