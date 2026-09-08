import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TrendChart from "./TrendChart";
import type { AnalyticsTrendSeries } from "../types";

const series: AnalyticsTrendSeries = {
  points: [
    {
      date: "20260901",
      previousDate: "20260804",
      current: { activeUsers: 10, newUsers: 4, sessions: 12 },
      previous: { activeUsers: 8, newUsers: 3, sessions: 9 },
    },
    {
      date: "20260902",
      previousDate: "20260805",
      current: { activeUsers: 0, newUsers: 0, sessions: 0 },
      previous: { activeUsers: 9, newUsers: 3, sessions: 10 },
    },
    {
      date: "20260903",
      previousDate: "20260806",
      current: { activeUsers: 2000, newUsers: 5, sessions: 22 },
      previous: { activeUsers: 7, newUsers: 2, sessions: 8 },
    },
  ],
};

afterEach(cleanup);

describe("TrendChart", () => {
  it("names the metric it is drawing and lists every point in text", () => {
    render(<TrendChart series={series} metric="activeUsers" showPrevious={false} />);

    expect(
      screen.getByRole("figure", { name: "일별 추세: 활성 사용자" }),
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("2026.09.01")).toBeInTheDocument();
    expect(within(table).getByText("2,000")).toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "이전 기간" }),
    ).not.toBeInTheDocument();
  });

  it("adds the previous period only when asked", () => {
    render(<TrendChart series={series} metric="sessions" showPrevious />);

    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "이전 기간" }),
    ).toBeInTheDocument();
    // The previous cell holds a date and a value in one string, so match on a
    // substring rather than the whole cell.
    expect(within(table).getByText(/2026\.08\.04/)).toBeInTheDocument();
    expect(
      screen.getByRole("figure", { name: "일별 추세: 세션" }),
    ).toBeInTheDocument();
  });

  it("reads out both values for the point under the pointer", () => {
    const { container } = render(
      <TrendChart series={series} metric="activeUsers" showPrevious />,
    );
    const hitAreas = container.querySelectorAll("[data-point]");
    expect(hitAreas).toHaveLength(3);

    fireEvent.mouseEnter(hitAreas[0] as Element);
    const tooltip = screen.getByTestId("trend-tooltip");
    expect(tooltip).toHaveTextContent("2026.09.01");
    expect(tooltip).toHaveTextContent("10");
    expect(tooltip).toHaveTextContent("8");

    fireEvent.mouseLeave(hitAreas[0] as Element);
    expect(screen.queryByTestId("trend-tooltip")).not.toBeInTheDocument();
  });

  it("tiles the hover bands across the plot so the last point is reachable", () => {
    const { container } = render(
      <TrendChart series={series} metric="activeUsers" showPrevious={false} />,
    );
    const bands = [...container.querySelectorAll("[data-point]")].map((band) => ({
      node: band,
      x: Number(band.getAttribute("x")),
      width: Number(band.getAttribute("width")),
    }));

    // Adjacent bands share an edge: no dead strip between two points.
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index].x).toBeCloseTo(
        bands[index - 1].x + bands[index - 1].width,
        5,
      );
    }

    // The last point sits at `width - PADDING.right`; its band must cover it.
    const last = bands[bands.length - 1];
    expect(720 - 12).toBeGreaterThanOrEqual(last.x);
    expect(720 - 12).toBeLessThanOrEqual(last.x + last.width);

    fireEvent.mouseEnter(last.node);
    expect(screen.getByTestId("trend-tooltip")).toHaveTextContent("2026.09.03");
  });

  it("still gives a single point a band with width", () => {
    const { container } = render(
      <TrendChart
        series={{ points: [series.points[0]] }}
        metric="activeUsers"
        showPrevious={false}
      />,
    );

    const only = container.querySelector("[data-point]");
    expect(Number(only?.getAttribute("width"))).toBeGreaterThan(0);
  });

  it("breaks the previous line at a gap instead of drawing it down to zero", () => {
    const { container } = render(
      <TrendChart
        series={{
          points: [
            series.points[0],
            { ...series.points[1], previousDate: null, previous: null },
            series.points[2],
          ],
        }}
        metric="activeUsers"
        showPrevious
      />,
    );

    const d =
      container.querySelector("path[stroke-dasharray]")?.getAttribute("d") ?? "";
    // One subpath either side of the gap...
    expect(d.match(/M/g)).toHaveLength(2);
    // ...and nothing plotted at the missing point's x (52 + 656 / 2).
    expect(d).not.toContain("380.0");
  });

  it("says there is nothing to draw rather than rendering an empty axis", () => {
    render(
      <TrendChart series={{ points: [] }} metric="newUsers" showPrevious={false} />,
    );

    expect(screen.getByText("표시할 일별 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
