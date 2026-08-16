import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AudienceCharts } from "./AudienceCharts";
import type { AudienceBreakdown } from "@/auth/api/business-insights.api";

const empty: AudienceBreakdown = {
  totalUsers: 0,
  gender: { male: 0, female: 0, unknown: 0 },
  ageBands: { "10s": 0, "20s": 0, "30s": 0, "40s": 0, "50s+": 0, unknown: 0 },
};

describe("AudienceCharts", () => {
  it("renders empty copy when every count is zero", () => {
    render(
      <AudienceCharts
        title="상세를 보고 나간 사람"
        breakdown={empty}
        emptyLabel="아직 방문 기록이 없어요"
      />,
    );
    expect(screen.getByText("아직 방문 기록이 없어요")).toBeInTheDocument();
    expect(screen.queryByText("남성")).not.toBeInTheDocument();
  });

  it("plots the counts from props, not literals in the chart", () => {
    const breakdown: AudienceBreakdown = {
      totalUsers: 7,
      gender: { male: 4, female: 2, unknown: 1 },
      ageBands: { "10s": 0, "20s": 3, "30s": 2, "40s": 1, "50s+": 1, unknown: 0 },
    };
    render(
      <AudienceCharts
        title="즐겨찾기"
        breakdown={breakdown}
        emptyLabel="즐겨찾기가 없어요"
      />,
    );
    expect(screen.getByText("7명")).toBeInTheDocument();
    expect(screen.getByText("남성 4")).toBeInTheDocument();
    expect(screen.getByText("여성 2")).toBeInTheDocument();
    expect(screen.getByText("20대 3")).toBeInTheDocument();
    expect(screen.queryByText("즐겨찾기가 없어요")).not.toBeInTheDocument();
  });
});
