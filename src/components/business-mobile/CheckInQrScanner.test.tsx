import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckInQrScanner } from "./CheckInQrScanner";

describe("CheckInQrScanner", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("submits a pasted check-in token when the camera is unavailable", async () => {
    const onToken = vi.fn();
    const user = userEvent.setup();
    render(
      <CheckInQrScanner
        open
        pending={false}
        error={null}
        onClose={() => undefined}
        onToken={onToken}
      />,
    );

    await user.type(screen.getByLabelText("QR 토큰"), "qr-token-1");
    await user.click(screen.getByRole("button", { name: "토큰으로 체크인" }));

    expect(onToken).toHaveBeenCalledWith("qr-token-1");
  });

  it("announces the camera fallback without relying on color", async () => {
    render(
      <CheckInQrScanner
        open
        pending={false}
        error={null}
        onClose={() => undefined}
        onToken={() => undefined}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "카메라 스캔을 지원하지 않습니다",
    );
  });
});
