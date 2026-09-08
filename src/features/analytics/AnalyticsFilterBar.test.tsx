import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsFilterBar } from "./AnalyticsFilterBar";
import { ANALYTICS_PLATFORMS, EMPTY_FILTERS } from "./analytics-filters";

afterEach(cleanup);

function renderBar(
  overrides: Partial<React.ComponentProps<typeof AnalyticsFilterBar>> = {},
) {
  const onChange = vi.fn();
  render(
    <AnalyticsFilterBar
      filters={EMPTY_FILTERS}
      onChange={onChange}
      platforms={ANALYTICS_PLATFORMS}
      accountTypeAvailability="available"
      {...overrides}
    />,
  );
  return { onChange };
}

describe("AnalyticsFilterBar", () => {
  it("exposes each platform as a pressed-state toggle", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar();

    const ios = screen.getByRole("button", { name: "iOS" });
    expect(ios).toHaveAttribute("aria-pressed", "false");
    await user.click(ios);

    expect(onChange).toHaveBeenCalledWith({
      platforms: ["iOS"],
      accountType: "all",
    });
    expect(screen.getByRole("group", { name: "보고서 필터" })).toBeInTheDocument();
  });

  it("counts what is applied and offers one reset", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({
      filters: { platforms: ["iOS", "web"], accountType: "business" },
    });

    expect(screen.getByText("필터 3개 적용 중")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "필터 초기화" }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it("explains why the account-type filter is unavailable instead of hiding it", () => {
    renderBar({ accountTypeAvailability: "unavailable" });

    expect(screen.getByLabelText("계정 유형")).toBeDisabled();
    expect(
      screen.getByText(
        "GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("says the property metadata could not be read when availability is unknown", () => {
    renderBar({ accountTypeAvailability: "unknown" });

    expect(screen.getByLabelText("계정 유형")).toBeDisabled();
    expect(
      screen.getByText(
        "GA4 속성 정보를 읽지 못해 계정 유형 필터를 사용할 수 없습니다.",
      ),
    ).toBeInTheDocument();
    // Not the "register account_type" hint: nothing says the property lacks it.
    expect(
      screen.queryByText(
        "GA4 맞춤 정의에 사용자 속성 account_type을 등록하면 사용할 수 있습니다.",
      ),
    ).not.toBeInTheDocument();
  });

  it("leaves the account-type filter enabled and unexplained when it is available", () => {
    renderBar({ accountTypeAvailability: "available" });

    expect(screen.getByLabelText("계정 유형")).toBeEnabled();
    expect(
      screen.queryByText(/계정 유형 필터를 사용할 수 없습니다/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/account_type을 등록하면/)).not.toBeInTheDocument();
  });

  it("says the realtime report ignores filters rather than silently dropping them", () => {
    renderBar({ disabled: true });

    expect(
      screen.getByText("실시간 보고서에는 필터가 적용되지 않습니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "iOS" })).toBeDisabled();
  });

  it("hides the platform chips for a single-platform property", () => {
    renderBar({ platforms: [] });

    expect(screen.queryByRole("button", { name: "iOS" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("계정 유형")).toBeInTheDocument();
  });
});
