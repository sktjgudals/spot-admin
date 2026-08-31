import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRetryableLazyComponent } from "./RetryableLazyComponent";

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <p role="alert">route boundary: {this.state.error.message}</p>
    ) : (
      this.props.children
    );
  }
}

describe("createRetryableLazyComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces a rejected chunk with an actionable error and retries the import", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce({
        default: ({ label }: { label: string }) => <p>{label}</p>,
      });
    const RetryablePanel = createRetryableLazyComponent<{ label: string }>(loader, {
      loading: <p role="status">화면 준비 중</p>,
      errorTitle: "화면을 불러오지 못했습니다.",
    });
    const user = userEvent.setup();

    render(<RetryablePanel label="복구된 화면" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "화면을 불러오지 못했습니다.",
    );
    expect(screen.queryByText("화면 준비 중")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("복구된 화면")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("rethrows descendant render errors to the route boundary instead of mislabeling them as chunk failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const BrokenRoute = () => {
      throw new Error("route render failed");
    };
    const loader = vi.fn().mockResolvedValue({
      default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
    });
    const RetryableChrome = createRetryableLazyComponent<{
      children: ReactNode;
    }>(loader, {
      loading: <p role="status">chrome loading</p>,
      errorTitle: "chunk failed",
    });

    render(
      <RouteErrorBoundary>
        <RetryableChrome>
          <BrokenRoute />
        </RetryableChrome>
      </RouteErrorBoundary>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "route boundary: route render failed",
    );
    expect(screen.queryByText("chunk failed")).not.toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
