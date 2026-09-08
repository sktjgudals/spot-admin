import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RetentionHeatmap } from "./RetentionHeatmap";
import type { AnalyticsRetentionResult } from "./types";

const result: AnalyticsRetentionResult = {
  view: "retention",
  granularity: "WEEKLY",
  horizon: 4,
  cohorts: [
    {
      name: "2026-08-23",
      startDate: "2026-08-23",
      endDate: "2026-08-29",
      totalUsers: 200,
      cells: [
        { week: 0, activeUsers: 200, rate: 1, state: "complete" },
        { week: 1, activeUsers: 90, rate: 0.45, state: "complete" },
        { week: 2, activeUsers: 40, rate: 0.2, state: "complete" },
        { week: 3, activeUsers: 10, rate: 0.05, state: "partial" },
        { week: 4, activeUsers: 0, rate: 0, state: "future" },
      ],
    },
    {
      name: "2026-08-30",
      startDate: "2026-08-30",
      endDate: "2026-09-05",
      totalUsers: 0,
      cells: [
        { week: 0, activeUsers: 0, rate: null, state: "complete" },
        { week: 1, activeUsers: 0, rate: null, state: "partial" },
        { week: 2, activeUsers: 0, rate: null, state: "future" },
        { week: 3, activeUsers: 0, rate: null, state: "future" },
        { week: 4, activeUsers: 0, rate: null, state: "future" },
      ],
    },
  ],
  currencyCode: "KRW",
  quota: null,
  dataQualityNotices: [],
  isEmpty: false,
};

afterEach(cleanup);

describe("RetentionHeatmap", () => {
  it("shows week 1 through 4 with the rate written out, never colour alone", () => {
    render(<RetentionHeatmap result={result} />);

    expect(
      screen.getByText("첫 세션 주 기준 주간 코호트 · GA4 firstSessionDate"),
    ).toBeInTheDocument();
    for (const header of ["코호트 시작일", "크기", "1주", "2주", "3주", "4주"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    // Week 0 stays in the data but not on screen: it is always 100 %.
    expect(screen.queryByRole("columnheader", { name: "0주" })).not.toBeInTheDocument();

    const row = screen.getByRole("row", { name: /2026-08-23/ });
    expect(within(row).getByText("45.0%")).toBeInTheDocument();
    expect(within(row).getByText("5.0%†")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("grades intensity in five steps and marks the unfinished week", () => {
    const { container } = render(<RetentionHeatmap result={result} />);

    const cells = container.querySelectorAll("td[data-intensity]");
    const intensities = [...cells].map((cell) => cell.getAttribute("data-intensity"));
    expect(intensities.slice(0, 4)).toEqual(["4", "2", "1", "0"]);
    expect(cells[2]?.getAttribute("data-state")).toBe("partial");
    expect(screen.getByText("† 아직 끝나지 않은 주")).toBeInTheDocument();
  });

  it("leaves an empty cohort blank rather than drawing it as a total loss", () => {
    render(<RetentionHeatmap result={result} />);

    const row = screen.getByRole("row", { name: /2026-08-30/ });
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(within(row).getByText("0")).toBeInTheDocument();
  });
});
