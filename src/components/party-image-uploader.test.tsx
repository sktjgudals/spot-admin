import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({ adminFetchJson: vi.fn() }));

import { PartyImageUploader } from "@/components/party-image-uploader";

describe("PartyImageUploader presentation props", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the default hint when none is provided", () => {
    render(
      <PartyImageUploader mode="single" value="" onChange={() => {}} uploadUrl="/x" />,
    );
    expect(screen.getByText(/jpeg\/png\/webp · 최대 10MB · 자동 리사이즈\(1920px\)/)).toBeInTheDocument();
  });

  it("replaces the hint and widens the preview for banner images", () => {
    render(
      <PartyImageUploader
        mode="single"
        value="https://media.dopa.ing/banners/a.webp"
        onChange={() => {}}
        uploadUrl="/x"
        hint="jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)"
        preview="wide"
      />,
    );
    expect(screen.queryByText(/자동 리사이즈/)).not.toBeInTheDocument();
    const image = screen.getByRole("presentation", { hidden: true });
    expect(image).toHaveAttribute("src", "https://media.dopa.ing/banners/a.webp");
    expect(image.parentElement).toHaveClass("aspect-video");
  });
});
