import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/oidc/public-clients", () => ({
  publicGoogleClientId: () => "existing-google-client-id",
}));

vi.mock("@/features/users/UserDetailPage", () => ({
  UserDetailPage: ({
    userId,
    analytics,
  }: {
    userId: string;
    analytics: {
      properties: Array<{ label: string }>;
      googleClientId: string;
      configError: string | null;
    };
  }) => (
    <section>
      <h1>{userId}</h1>
      <p>{analytics.properties[0]?.label ?? "No property"}</p>
      <p>{analytics.googleClientId}</p>
      {analytics.configError ? <p role="alert">{analytics.configError}</p> : null}
    </section>
  ),
}));

import SuperAdminUserDetailRoute from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("SuperAdminUserDetailRoute", () => {
  it("awaits the route param and passes validated public GA config down", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_GA4_PROPERTIES",
      JSON.stringify([{ id: "5678", label: "Dopa App", platform: "mixed" }]),
    );

    render(await SuperAdminUserDetailRoute({ params: Promise.resolve({ id: "u1" }) }));

    expect(screen.getByRole("heading", { name: "u1" })).toBeInTheDocument();
    expect(screen.getByText("Dopa App")).toBeInTheDocument();
    expect(screen.getByText("existing-google-client-id")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces invalid public configuration instead of rendering a broken panel", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA4_PROPERTIES", "invalid");

    render(await SuperAdminUserDetailRoute({ params: Promise.resolve({ id: "u1" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("올바른 JSON 배열");
  });
});
