import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsDataApiError } from "./analytics-data-api";
import { AnalyticsErrorState } from "./AnalyticsStates";

afterEach(cleanup);

function renderError(error: Error) {
  render(<AnalyticsErrorState error={error} retry={vi.fn()} />);
}

function unknownField(apiMessage?: string) {
  return new AnalyticsDataApiError(
    "unknown-field",
    "GA4 속성에 요청한 측정기준 또는 측정항목이 없습니다.",
    { status: 400, apiMessage },
  );
}

describe("AnalyticsErrorState", () => {
  it("names the dimension GA4 actually rejected instead of assuming dopa_uid", () => {
    renderError(
      unknownField("Field customUser:dopa_uid is not a valid dimension."),
    );

    expect(
      screen.getByRole("heading", {
        name: "GA4에 customUser:dopa_uid 측정기준이 아직 없어요",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/맞춤 측정기준 customUser:dopa_uid 등록/)).toBeInTheDocument();
  });

  it("names an account-type dimension the same way", () => {
    renderError(
      unknownField(
        "Field customUser:account_type is not a valid dimension for this property.",
      ),
    );

    expect(
      screen.getByRole("heading", {
        name: "GA4에 customUser:account_type 측정기준이 아직 없어요",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/dopa_uid/)).not.toBeInTheDocument();
  });

  it("falls back to generic wording when Google's sentence names no field", () => {
    renderError(unknownField("Something went wrong."));

    expect(
      screen.getByRole("heading", {
        name: "GA4에 요청한 사용자 속성 측정기준이 아직 없어요",
      }),
    ).toBeInTheDocument();
    // The registration guidance survives the fallback: it is the only thing
    // that tells an operator what to do next.
    expect(screen.getByText(/맞춤 정의/)).toBeInTheDocument();
  });

  it("shows Google's own sentence under a rejected request", () => {
    renderError(
      new AnalyticsDataApiError(
        "request",
        "Google Analytics 보고서 요청을 처리하지 못했습니다.",
        {
          status: 400,
          apiMessage: "Unknown request field: funnelBreakdown.",
        },
      ),
    );

    expect(
      screen.getByRole("heading", { name: "보고서 정의를 처리하지 못했습니다." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("GA4 응답: Unknown request field: funnelBreakdown."),
    ).toBeInTheDocument();
  });

  it("omits the response line when GA4 sent no message", () => {
    renderError(
      new AnalyticsDataApiError(
        "request",
        "Google Analytics 보고서 요청을 처리하지 못했습니다.",
        { status: 400 },
      ),
    );

    expect(screen.queryByText(/GA4 응답:/)).not.toBeInTheDocument();
  });
});
