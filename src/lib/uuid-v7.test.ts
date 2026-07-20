import { describe, expect, it } from "vitest";
import { uuidV7 } from "./uuid-v7";

describe("uuidV7", () => {
  it("encodes the timestamp with UUIDv7 version and RFC variant", () => {
    const value = uuidV7(1_720_000_000_000);
    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("does not reuse the idempotency key", () => {
    expect(uuidV7(1_720_000_000_000)).not.toBe(uuidV7(1_720_000_000_000));
  });
});
