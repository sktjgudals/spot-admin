import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({ adminFetchJson: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { PartyImageUploader } from "@/components/party-image-uploader";
import { toast } from "sonner";

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

describe("PartyImageUploader upload behavior", () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalFetch = globalThis.fetch;

  function selectFile(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");
    return input as HTMLInputElement;
  }

  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
    vi.mocked(toast.error).mockReset();

    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 10,
      height: 10,
      close() {},
    })) as unknown as typeof globalThis.createImageBitmap;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage() {},
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = ((callback: BlobCallback, type?: string) => {
      callback(new Blob(["x"], { type: String(type) }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.createImageBitmap = originalCreateImageBitmap;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    globalThis.fetch = originalFetch;
  });

  it("uploads a selected file: presigns, PUTs to storage, and reports the public URL", async () => {
    vi.mocked(adminFetchJson).mockResolvedValueOnce({
      uploadUrl: "https://r2.example.com/put-here",
      publicUrl: "https://media.dopa.ing/banners/new.webp",
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <PartyImageUploader
        mode="single"
        value=""
        onChange={onChange}
        uploadUrl="/admin/v2/media/upload-url"
      />,
    );

    const file = new File(["x"], "photo.png", { type: "image/png" });
    await user.upload(selectFile(container), file);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://media.dopa.ing/banners/new.webp"),
    );

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/media/upload-url",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = vi.mocked(adminFetchJson).mock.calls[0] ?? [];
    const body = JSON.parse(String((init as { body?: unknown })?.body)) as Record<string, unknown>;
    expect(body).toHaveProperty("contentType");
    expect(body).toHaveProperty("sizeBytes");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://r2.example.com/put-here",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("shows a deployment-gap message and skips onChange when the presign call 404s", async () => {
    vi.mocked(adminFetchJson).mockRejectedValueOnce(
      new AdminAuthError("HTTP_ERROR", "Not Found", { status: 404 }),
    );
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <PartyImageUploader
        mode="single"
        value=""
        onChange={onChange}
        uploadUrl="/admin/v2/media/upload-url"
      />,
    );

    const file = new File(["x"], "photo.png", { type: "image/png" });
    await user.upload(selectFile(container), file);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    const [message] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(String(message)).toContain("배포 상태");
  });
});
