import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DopaMediaImage } from "./dopa-media-image";

describe("DopaMediaImage", () => {
  afterEach(cleanup);

  it("loads a display-sized DOPA thumbnail with non-blocking defaults", () => {
    render(
      <DopaMediaImage
        src="https://media.dopa.ing/profiles/user-1.jpg"
        transformWidth={80}
        alt="사용자 프로필"
        className="avatar"
      />,
    );

    const image = screen.getByRole("img", { name: "사용자 프로필" });
    expect(image).toHaveAttribute(
      "src",
      "https://media.dopa.ing/t/width=80,quality=72,format=webp,fit=scale-down/profiles/user-1.jpg",
    );
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveClass("avatar");
  });

  it("falls back to the original once when the transform service is unavailable", () => {
    const onError = vi.fn();
    render(
      <DopaMediaImage
        src="https://media.dopa.ing/profiles/user-1.jpg"
        transformWidth={80}
        alt="사용자 프로필"
        onError={onError}
      />,
    );

    const image = screen.getByRole("img", { name: "사용자 프로필" });
    fireEvent.error(image);
    expect(image).toHaveAttribute(
      "src",
      "https://media.dopa.ing/profiles/user-1.jpg",
    );

    fireEvent.error(image);
    expect(image).toHaveAttribute(
      "src",
      "https://media.dopa.ing/profiles/user-1.jpg",
    );
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("does not rewrite an untrusted runtime image URL", () => {
    render(
      <DopaMediaImage
        src="https://images.example.test/avatar.jpg"
        transformWidth={80}
        alt="외부 프로필"
      />,
    );

    expect(screen.getByRole("img", { name: "외부 프로필" })).toHaveAttribute(
      "src",
      "https://images.example.test/avatar.jpg",
    );
  });
});
