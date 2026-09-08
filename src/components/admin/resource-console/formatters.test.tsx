import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatResourceText,
  getStatusLabel,
  renderResourceValue,
  summarizeResourceRow,
} from "./formatters";

describe("resource console formatters", () => {
  afterEach(() => {
    cleanup();
  });

  it("formats amounts and known statuses for dense scanning", () => {
    expect(formatResourceText(20_000, "amount")).toBe("₩20,000");
    expect(getStatusLabel("DONE")).toBe("완료");
    expect(getStatusLabel("CUSTOM_STATUS")).toBe("CUSTOM_STATUS");
  });

  it("builds the confirmation summary from configured columns only", () => {
    expect(
      summarizeResourceRow(
        {
          key: "payments",
          title: "결제 관리",
          description: "",
          resource: "payments",
          columns: [
            { key: "orderId", label: "주문번호" },
            { key: "amount", label: "금액" },
          ],
        },
        { id: "payment-1", orderId: "order-1", amount: 20_000, secret: "hidden" },
      ),
    ).toBe("주문번호 order-1 · 금액 ₩20,000");
  });

  it("renders image URLs as thumbnails and other strings as text", () => {
    render(<>{renderResourceValue("https://media.dopa.ing/banners/a.webp", "imageUrl")}</>);
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "https://media.dopa.ing/banners/a.webp");
    expect(image).toHaveAttribute("title", "https://media.dopa.ing/banners/a.webp");

    render(<>{renderResourceValue("not-a-url", "imageUrl")}</>);
    expect(screen.getByText("not-a-url")).toBeInTheDocument();
  });
});
