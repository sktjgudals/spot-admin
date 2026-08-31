import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSignInButton } from "./google-gis";

const google = {
  initialize: vi.fn(),
  renderButton: vi.fn(),
};

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    google.initialize.mockReset();
    google.renderButton.mockReset();
    Object.defineProperty(window, "google", {
      configurable: true,
      value: { accounts: { id: google } },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 272,
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "google");
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  });

  it("fits the Google control to a narrow login card without exceeding 320px", async () => {
    const { getByTestId } = render(
      <GoogleSignInButton clientId="public-client" onCredential={vi.fn()} />,
    );

    await waitFor(() => {
      expect(google.renderButton).toHaveBeenCalledWith(
        getByTestId("google-signin"),
        expect.objectContaining({ width: 272 }),
      );
    });
    expect(getByTestId("google-signin")).toHaveClass("w-full", "max-w-[320px]");
  });

  it("removes the embedded Google control from keyboard interaction while disabled", () => {
    const { getByTestId } = render(
      <GoogleSignInButton clientId="public-client" disabled onCredential={vi.fn()} />,
    );

    expect(getByTestId("google-signin")).toHaveAttribute("inert");
    expect(getByTestId("google-signin")).toHaveAttribute("aria-disabled", "true");
  });
});
