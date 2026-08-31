import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/oidc/public-clients", () => ({
  publicGoogleClientId: () => "existing-google-client-id",
}));

vi.mock("@/features/analytics/AnalyticsDashboard", () => ({
  AnalyticsDashboard: ({
    properties,
    googleClientId,
    configError,
  }: {
    properties: Array<{ label: string }>;
    googleClientId: string;
    configError: string | null;
  }) => (
    <section>
      <h1>{properties[0]?.label ?? "No property"}</h1>
      <p>{googleClientId}</p>
      {configError ? <p role="alert">{configError}</p> : null}
    </section>
  ),
}));

import AnalyticsPage from "./page";

describe("AnalyticsPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("passes validated public properties and the existing Google client to the feature", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_GA4_PROPERTIES",
      JSON.stringify([{ id: "1234", label: "Dopa Web", platform: "web" }]),
    );

    render(<AnalyticsPage />);

    expect(screen.getByRole("heading", { name: "Dopa Web" })).toBeInTheDocument();
    expect(screen.getByText("existing-google-client-id")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces invalid public configuration instead of rendering a broken report", () => {
    vi.stubEnv("NEXT_PUBLIC_GA4_PROPERTIES", "invalid");

    render(<AnalyticsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("올바른 JSON 배열");
  });
});
